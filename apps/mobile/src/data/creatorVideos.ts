// A creator's latest recipe videos ("More from Food is Love"): the worker lists them in a 'creator' job
// (CreatorVideos in import_jobs.result), from the channel's link or from a saved recipe of theirs.
import type { CreatorVideos, ImportPlatform, Recipe } from '@mesa/shared';
import { useState } from 'react';

import { creatorLinkOf, handleOf } from '../lib/creatorUrl';
import { formatMinutes } from '../lib/text';
import { askOutcome } from './askOutcome';
import { useWorkerAsk, type AskJob, type AskQuestion } from './workerAsk';

/** Whose videos to list: a channel or playlist link, or a saved YouTube recipe (the worker finds its channel). */
export type CreatorTarget = ({ url: string } | { recipeId: string }) & {
  /** What is known before the list says: the name ("Food is Love"), the channel id. */
  name?: string | null;
  channelId?: string | null;
};

/** A creator, as Follow needs it. */
export interface CreatorRef {
  channelId: string;
  name: string;
  url: string;
  platform: ImportPlatform;
}

/** One video, ready to show and to import. */
export interface CreatorVideoView {
  /** The video's link. */
  key: string;
  url: string;
  title: string;
  /** "68k views · 9 min". */
  meta: string | null;
  /** The dish, when the title says something else ("Hungarian paprika chicken"). */
  dish: string | null;
  thumbnail: string | null;
  /** Already in the household's recipes. */
  saved: boolean;
}

/** A pasted or shared YouTube channel / playlist link opens its creator's videos; null for anything else. */
export function creatorTargetFromText(text: string): CreatorTarget | null {
  const url = creatorLinkOf(text);
  return url ? { url, name: handleOf(url) } : null;
}

/** The credit line on a recipe: "More from Food is Love" (opens their videos), or just "By Food is Love". */
export interface RecipeCreatorView {
  label: string;
  /** For the avatar; null when the source does not say. */
  name: string | null;
  /** Null when there is nothing to list (not a YouTube recipe): the line is only a credit. */
  target: CreatorTarget | null;
}

export function recipeCreator(
  r: Pick<Recipe, 'id' | 'source_platform' | 'source_author' | 'source_channel_url' | 'source_channel_id'>,
): RecipeCreatorView | null {
  const name = r.source_author?.trim() || null;
  const more = `More from ${name ?? 'this creator'}`;
  const channelId = r.source_channel_id ?? null;
  if (r.source_channel_url) return { label: more, name, target: { url: r.source_channel_url, name, channelId } };
  if (r.source_platform === 'youtube') return { label: more, name, target: { recipeId: r.id, name, channelId } };
  return name ? { label: `By ${name}`, name, target: null } : null;
}

// The worker's answer, read defensively --------------------------------------------------------

/** 950, 1.2k, 68k, 3.4M. */
function shortCount(n: number): string {
  if (n < 1000) return String(n);
  const [value, suffix] = n < 999_500 ? [n / 1e3, 'k'] : n < 999_500_000 ? [n / 1e6, 'M'] : [n / 1e9, 'B'];
  return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)}${suffix}`;
}

/** "68k views · 9 min". */
function videoMeta(views: unknown, seconds: unknown): string | null {
  const parts = [
    typeof views === 'number' && views >= 0 ? `${shortCount(Math.round(views))} ${views === 1 ? 'view' : 'views'}` : null,
    typeof seconds === 'number' && seconds > 0 ? formatMinutes(Math.max(1, Math.round(seconds / 60))) : null,
  ].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,!?:;'"’‘“”()[\]{}|#&/+*~_–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The dish, unless the title already says it. */
function dishLine(dish: unknown, title: string): string | null {
  if (typeof dish !== 'string' || dish.trim() === '') return null;
  const d = words(dish);
  return d.length > 0 && words(title).includes(d) ? null : dish.trim();
}

function creatorOf(value: unknown): CreatorRef | null {
  const c = value as Partial<CreatorVideos['creator']> | null | undefined;
  if (typeof c?.channel_id !== 'string' || typeof c.name !== 'string' || typeof c.url !== 'string') return null;
  if (c.channel_id === '' || c.name.trim() === '' || !/^https:\/\//i.test(c.url)) return null;
  return { channelId: c.channel_id, name: c.name.trim(), url: c.url, platform: c.platform ?? 'youtube' };
}

/** Videos with a link and a title, once each, in the worker's order (newest first). */
export function creatorVideoViews(value: unknown): CreatorVideoView[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const views: CreatorVideoView[] = [];
  for (const v of value as Partial<CreatorVideos['videos'][number]>[]) {
    if (typeof v?.url !== 'string' || !/^https?:\/\//i.test(v.url) || seen.has(v.url)) continue;
    if (typeof v.title !== 'string' || v.title.trim() === '') continue;
    seen.add(v.url);
    const title = v.title.trim();
    views.push({
      key: v.url,
      url: v.url,
      title,
      meta: videoMeta(v.views, v.duration_s),
      dish: dishLine(v.dish, title),
      thumbnail: typeof v.thumbnail === 'string' && /^https?:\/\//i.test(v.thumbnail) ? v.thumbnail : null,
      saved: v.saved === true,
    });
  }
  return views;
}

// Asking ---------------------------------------------------------------------------------------

function questionFor(target: CreatorTarget, fresh: boolean): AskQuestion {
  // The name rides along on a new job: the working bar says whose videos it is looking at.
  const label = target.name ?? null;
  return 'url' in target ? { url: target.url, label, reuseDone: !fresh } : { subjectId: target.recipeId, label, reuseDone: !fresh };
}

/** Whose videos a job asked for (a job opened by id: a notification, the working bar). */
function jobTarget(job: AskJob | null): CreatorTarget | null {
  if (!job) return null;
  const name = job.input_text?.trim() || null;
  if (job.input_url) return { url: job.input_url, name };
  return job.subject_id ? { recipeId: job.subject_id, name } : null;
}

function sameTarget(a: CreatorTarget, b: CreatorTarget): boolean {
  return 'url' in a ? 'url' in b && a.url === b.url : 'recipeId' in b && a.recipeId === b.recipeId;
}

/**
 * A creator's latest recipe videos, on request. `load(target)` asks the worker (a list from the last
 * hour is reused); `follow(jobId)` picks up a list asked earlier; `retry` asks again (anew when the list
 * came back empty). Listing can take minutes: nobody has to wait, the job keeps going.
 */
export function useCreatorVideos() {
  const ask = useWorkerAsk('creator');
  const [chosen, setChosen] = useState<CreatorTarget | null>(null);
  const target = chosen ?? jobTarget(ask.job);
  const result = ask.phase === 'done' ? (ask.job?.result as Partial<CreatorVideos> | null | undefined) : null;
  const creator = creatorOf(result?.creator);
  const videos = creatorVideoViews(result?.videos);
  const name = creator?.name ?? (target?.name || null) ?? (target && 'url' in target ? handleOf(target.url) : null);

  const { state, message, canRetry } = askOutcome(ask, videos.length > 0, {
    notAsked: "Couldn't look at their videos. Try again.",
    failed: "Couldn't list their videos right now.",
    empty: `No recipe videos from ${name ?? 'this creator'} yet.`,
  });

  return {
    target,
    /** "Food is Love", "@foodislove" from the link until then, or null. */
    name,
    /** Known once listed. */
    creator,
    state,
    videos,
    message,
    /** The job followed, once queued. */
    jobId: ask.jobId,
    load: (t: CreatorTarget) => {
      // The same creator again: their list (or the wait for it) is still here.
      if (target && sameTarget(t, target) && (state === 'ready' || ask.phase === 'working')) {
        setChosen(t);
        return;
      }
      ask.reset();
      setChosen(t);
      ask.ask(questionFor(t, false));
    },
    follow: (jobId: string) => {
      if (jobId === ask.jobId) return;
      setChosen(null);
      ask.follow(jobId);
    },
    /** Asking again can work today (not after Mesa's daily limit). */
    canRetry,
    retry: () => {
      if (target) ask.ask(questionFor(target, ask.phase === 'done'));
    },
  };
}
