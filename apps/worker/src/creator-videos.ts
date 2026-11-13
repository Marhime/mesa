// Which of a creator's latest videos are shown: real videos (no Shorts, short clips, lives or
// members-only), the recipes among them — one batched question to the model, which also names the dish
// in a few words — newest first, at most 20, each marked when the household already saved it.
import { nullable, Type, type ModelSchema } from './model-schema';
import type { CreatorVideos } from '@mesa/shared';
import type { FlatVideo } from './ytdlp-channel';

/** Shorter clips are teasers or Shorts, not recipes to cook from. */
export const MIN_SECONDS = 90;
export const MAX_VIDEOS = 20;
const MAX_DISH = 60;
const MAX_PROMPT_DESCRIPTION = 200;
const LIVE = new Set(['is_live', 'is_upcoming', 'was_live', 'post_live']);
const LOCKED = new Set(['subscriber_only', 'premium_only', 'needs_auth', 'private']);

export const thumbnailFor = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
/** The same form as recipes.source_url (normalizeUrl). */
export const watchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;

/** The videos worth asking about, newest first, each once. */
export function candidateVideos(videos: readonly FlatVideo[]): FlatVideo[] {
  const seen = new Set<string>();
  const kept = videos.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    if (v.short || (v.liveStatus !== null && LIVE.has(v.liveStatus)) || (v.availability !== null && LOCKED.has(v.availability))) return false;
    return v.duration === null || v.duration >= MIN_SECONDS;
  });
  // A Videos tab is already newest first; dates, when every video has one, decide otherwise (playlists).
  if (kept.every((v) => v.timestamp !== null)) return kept.sort((a, b) => b.timestamp! - a.timestamp!);
  return kept;
}


export const CREATOR_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    videos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'The video id, exactly as given.' },
          recipe: { type: Type.BOOLEAN, description: 'True when the video shows how to cook or prepare a dish.' },
          dish: nullable({ type: Type.STRING, description: 'The dish in a few words, in the language of the title; null when not a recipe.' }),
        },
        required: ['id', 'recipe', 'dish'],
        propertyOrdering: ['id', 'recipe', 'dish'],
      },
    },
  },
  required: ['videos'],
};

export function creatorSystemPrompt(): string {
  return `You sort a cooking creator's latest YouTube videos for a household kitchen app, where people pick recipes to cook.
For every video given (id, title, sometimes a short description), answer once with its id exactly as given:
- recipe: true when the video shows how to cook or prepare a dish (or a few dishes) someone could cook from. False for vlogs, Q&As, channel news, restaurant or product reviews, taste tests, mukbangs, shopping hauls, kitchen or equipment tours, challenges and reactions.
- dish: for a recipe, the dish in a few words (2 to 6), in the language of the title, e.g. "Hungarian paprika chicken". No emojis, hashtags, clickbait words ("best ever", "you won't believe"), or the creator's name. null when not a recipe.`;
}

export function creatorUserPrompt(creator: string | null, videos: readonly FlatVideo[]): string {
  const list = videos.map((v) => ({
    id: v.id,
    title: v.title,
    ...(v.description ? { description: v.description.slice(0, MAX_PROMPT_DESCRIPTION) } : {}),
  }));
  return `Creator: ${creator ?? 'unknown'}\nVideos:\n${JSON.stringify(list, null, 1)}`;
}

/** A dish name as shown: no emojis or hashtags, no stray punctuation at the ends, short. */
export function cleanDish(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0F]/gu, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|,.!?"'“”]+|[\s\-–—:|,.!?"'“”]+$/gu, '');
  return s === '' ? null : s.slice(0, MAX_DISH).trim();
}

/**
 * The model's answer as kept: id → dish for each video it calls a recipe, for ids that were asked about
 * (first answer wins). Null when the answer has no list at all (unreadable, not "no recipes").
 */
export function recipeVerdicts(raw: unknown, asked: ReadonlySet<string>): Map<string, string | null> | null {
  const list = (raw as { videos?: unknown } | null)?.videos;
  if (!Array.isArray(list)) return null;
  const verdicts = new Map<string, string | null>();
  const answered = new Set<string>();
  for (const item of list as Array<Record<string, unknown> | null>) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!asked.has(id) || answered.has(id)) continue;
    answered.add(id);
    if (item!.recipe === true) verdicts.set(id, cleanDish(item!.dish));
  }
  return verdicts;
}

/** The recipe videos in listing order, at most MAX_VIDEOS, marked when already saved (normalized URLs). */
export function creatorVideoList(
  candidates: readonly FlatVideo[],
  verdicts: ReadonlyMap<string, string | null>,
  saved: ReadonlySet<string>,
): CreatorVideos['videos'] {
  return candidates
    .filter((v) => verdicts.has(v.id))
    .slice(0, MAX_VIDEOS)
    .map((v) => {
      const url = watchUrl(v.id);
      return {
        url,
        title: v.title,
        dish: verdicts.get(v.id) ?? null,
        views: v.views === null ? null : Math.round(v.views),
        duration_s: v.duration === null ? null : Math.round(v.duration),
        thumbnail: thumbnailFor(v.id),
        saved: saved.has(url),
      };
    });
}
