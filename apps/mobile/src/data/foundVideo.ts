// A real recipe video Mesa found for the household (a For you suggestion, an Ask Mesa search), ready for its
// card: title, "Food is Love · 9 min", and why it fits. Read defensively: a model wrote it. Pure.
import type { FoundVideo } from '@mesa/shared';

import { formatMinutes } from '../lib/text';
import { videoIdentity } from './creatorNews';
import type { RecipeSummary } from './recipes';

/** One found video, ready for its card. */
export interface FoundVideoView {
  /** The row id (For you) or the link (Ask Mesa's searches). */
  key: string;
  url: string;
  title: string;
  /** "Food is Love · 9 min"; null when neither is known. */
  meta: string | null;
  /** Why it fits ("Like the tinga you made twice"): never empty. */
  why: string;
  thumbnail: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** "Food is Love · 9 min". */
export function videoByline(creator: unknown, seconds: unknown): string | null {
  const minutes = typeof seconds === 'number' && seconds > 0 ? formatMinutes(Math.max(1, Math.round(seconds / 60))) : null;
  const parts = [text(creator), minutes].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A video with an https link, a title and a why (a card without its why is not shown); null otherwise. */
export function foundVideoView(v: Partial<FoundVideo> | null | undefined, key?: string): FoundVideoView | null {
  const url = text(v?.url);
  const title = text(v?.title);
  const why = text(v?.why);
  if (!v || !url || !/^https:\/\//i.test(url) || !title || !why) return null;
  const thumbnail = text(v.thumbnail);
  return {
    key: key ?? url,
    url,
    title,
    meta: videoByline(v.creator, v.duration_s),
    why,
    thumbnail: thumbnail && /^https?:\/\//i.test(thumbnail) ? thumbnail : null,
  };
}

/** The videos already in Recipes (same YouTube video whatever the link looks like). */
export function savedVideoIds(recipes: Pick<RecipeSummary, 'source_url'>[]): ReadonlySet<string> {
  return new Set(recipes.map((r) => videoIdentity(r.source_url)).filter((id): id is string => !!id));
}

/** True when this video is one of `saved`. */
export function isSavedVideo(url: string, saved: ReadonlySet<string>): boolean {
  const id = videoIdentity(url);
  return !!id && saved.has(id);
}
