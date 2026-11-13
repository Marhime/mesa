// The cheap rules a video must pass before anyone spends a call on it: YouTube only, 1 to 40 minutes, no
// Shorts, lives or members-only videos, at least 5,000 views, each video once, and nothing the household
// already has (saved as a recipe, or — for the weekly look — already suggested, whatever was decided).
import type { Candidate } from './discover-candidates';
import type { KnownLinks } from './discover-profile';
import { youtubeVideoId } from './url';

export const MIN_SECONDS = 60;
export const MAX_SECONDS = 40 * 60;
export const MIN_VIEWS = 5000;
const LIVE = new Set(['is_live', 'is_upcoming', 'was_live', 'post_live']);
const LOCKED = new Set(['subscriber_only', 'premium_only', 'needs_auth', 'private']);

export type DiscoverKind = 'for_you' | 'find';

export type Rejection = 'not_youtube' | 'short' | 'live' | 'locked' | 'too_short' | 'too_long' | 'few_views' | 'no_duration' | 'no_views' | 'known' | 'duplicate';

/**
 * Why a video can't be shown, or null. Unknown duration and views pass while its page may still tell
 * them; `final` (nothing more will be learned) needs both.
 */
export function rejection(c: Candidate, final: boolean): Rejection | null {
  if (youtubeVideoId(c.url) !== c.id) return 'not_youtube';
  if (c.short) return 'short';
  if (c.liveStatus !== null && LIVE.has(c.liveStatus)) return 'live';
  if (c.availability !== null && LOCKED.has(c.availability)) return 'locked';
  if (c.duration === null) {
    if (final) return 'no_duration';
  } else if (c.duration < MIN_SECONDS) {
    return 'too_short';
  } else if (c.duration > MAX_SECONDS) {
    return 'too_long';
  }
  if (c.views === null) return final ? 'no_views' : null;
  return c.views < MIN_VIEWS ? 'few_views' : null;
}

/** Links not to show: saved recipes, plus every earlier suggestion (weekly) or the dismissed ones (Find me). */
export function excludedLinks(known: KnownLinks, kind: DiscoverKind): Set<string> {
  return new Set([...known.saved, ...(kind === 'for_you' ? known.suggested : known.dismissed)]);
}

export interface Filtered {
  kept: Candidate[];
  /** How many were left out, by reason (for the log). */
  dropped: Partial<Record<Rejection, number>>;
}

/** Each video once (first seen wins), in order, without what the rules or `excluded` leave out. */
export function filterCandidates(candidates: readonly Candidate[], excluded: ReadonlySet<string>, final: boolean): Filtered {
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  const dropped: Filtered['dropped'] = {};
  for (const c of candidates) {
    let why: Rejection | null;
    if (seen.has(c.id)) why = 'duplicate';
    else if (excluded.has(c.url)) why = 'known';
    else why = rejection(c, final);
    seen.add(c.id);
    if (why === null) kept.push(c);
    else dropped[why] = (dropped[why] ?? 0) + 1;
  }
  return { kept, dropped };
}
