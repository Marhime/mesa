// Which videos win. Quality is how much a video was loved relative to its channel's size (a small
// channel's hit beats a big channel's dud) blended with its like rate; taste fit is the model's verdict;
// creator trust comes from what the household did (cooked, saved, followed → up; "not for us" → down);
// novelty favors recent uploads. Then diversity: at most 2 per creator and 2 per cuisine.
// Before any page is opened, a cheap pre-ranking picks which videos are worth opening.
import { normalizeText } from '@mesa/shared';

import type { Candidate, Origin } from './discover-candidates';
import type { Verdict } from './discover-judge';
import type { CreatorSignal } from './discover-profile';

export const WEIGHTS = { fit: 0.4, quality: 0.3, trust: 0.2, novelty: 0.1 } as const;
export const PER_CREATOR = 2;
export const PER_CUISINE = 2;
/** How much a channel's size discounts its views: ln(views) − 0.8·ln(followers). */
const FOLLOWER_EXPONENT = 0.8;
/** A like rate this high (likes / views) counts as fully loved. */
const GREAT_LIKE_RATE = 0.04;
const REACH_SHARE = 0.6;
/** Without views, a video is assumed middling at best. */
const UNKNOWN_QUALITY = 0.3;
const FRESH_DAYS = 60;
const OLD_DAYS = 3 * 365;
const OLD_NOVELTY = 0.2;
const DAY_S = 86_400;

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** 0–1: views relative to the channel's size (σ(ln views − 0.8·ln followers)), blended with likes / views. */
export function quality(c: Pick<Candidate, 'views' | 'likes' | 'followers'>): number {
  if (c.views === null || c.views <= 0) return UNKNOWN_QUALITY;
  const reach = c.followers !== null && c.followers > 0 ? sigmoid(Math.log(c.views) - FOLLOWER_EXPONENT * Math.log(c.followers)) : 0.5;
  if (c.likes === null) return reach;
  return REACH_SHARE * reach + (1 - REACH_SHARE) * clamp01(c.likes / c.views / GREAT_LIKE_RATE);
}

/** 1 for an upload of the last two months, down to 0.2 at three years; 0.5 when the date is unknown. */
export function novelty(uploadedAt: number | null, nowMs: number): number {
  if (uploadedAt === null) return 0.5;
  const days = (nowMs / 1000 - uploadedAt) / DAY_S;
  if (days <= FRESH_DAYS) return 1;
  return Math.max(OLD_NOVELTY, 1 - ((days - FRESH_DAYS) / (OLD_DAYS - FRESH_DAYS)) * (1 - OLD_NOVELTY));
}

/** 0–1 for a creator: 0.5 when unknown, higher the more the household cooked / kept / followed them. */
export type Trust = (c: Pick<Candidate, 'channelId' | 'channel'>) => number;

const nameKey = (name: string | null): string | null => {
  const k = name ? normalizeText(name) : '';
  return k === '' ? null : k;
};

/** Sums the signals per channel id and per name; a video's channel id is looked up first. */
export function creatorTrust(signals: readonly CreatorSignal[]): Trust {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const s of signals) {
    if (s.channelId) byId.set(s.channelId, (byId.get(s.channelId) ?? 0) + s.weight);
    const key = nameKey(s.name);
    if (key) byName.set(key, (byName.get(key) ?? 0) + s.weight);
  }
  return (c) => {
    const key = nameKey(c.channel);
    const sum = (c.channelId ? byId.get(c.channelId) : undefined) ?? (key ? byName.get(key) : undefined) ?? 0;
    return (Math.tanh(sum / 2) + 1) / 2;
  };
}

export interface Ranked {
  candidate: Candidate;
  verdict: Verdict;
  score: number;
}

export function scoreOf(parts: { fit: number; quality: number; trust: number; novelty: number }): number {
  const s = WEIGHTS.fit * parts.fit + WEIGHTS.quality * parts.quality + WEIGHTS.trust * parts.trust + WEIGHTS.novelty * parts.novelty;
  return Math.round(s * 1000) / 1000;
}

/** The judged recipes, best first; those fitting less than `minFit` left out. */
export function rankVideos(
  candidates: readonly Candidate[],
  verdicts: ReadonlyMap<string, Verdict>,
  trust: Trust,
  nowMs: number,
  minFit = 0,
): Ranked[] {
  const ranked: Ranked[] = [];
  for (const candidate of candidates) {
    const verdict = verdicts.get(candidate.id);
    if (!verdict || verdict.fit < minFit) continue;
    const score = scoreOf({ fit: verdict.fit, quality: quality(candidate), trust: trust(candidate), novelty: novelty(candidate.uploadedAt, nowMs) });
    ranked.push({ candidate, verdict, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** The creator a video counts against (channel id, else name, else the video itself). */
export const creatorKey = (c: Pick<Candidate, 'id' | 'channelId' | 'channel'>): string => c.channelId ?? nameKey(c.channel) ?? `video:${c.id}`;

/** The best `max`, in order, with at most PER_CREATOR per creator and PER_CUISINE per cuisine (unknown: no cap). */
export function diversify(ranked: readonly Ranked[], max: number, perCreator = PER_CREATOR, perCuisine = PER_CUISINE): Ranked[] {
  const creators = new Map<string, number>();
  const cuisines = new Map<string, number>();
  const out: Ranked[] = [];
  for (const r of ranked) {
    if (out.length === max) break;
    const creator = creatorKey(r.candidate);
    const cuisine = nameKey(r.verdict.cuisine);
    if ((creators.get(creator) ?? 0) >= perCreator) continue;
    if (cuisine && (cuisines.get(cuisine) ?? 0) >= perCuisine) continue;
    creators.set(creator, (creators.get(creator) ?? 0) + 1);
    if (cuisine) cuisines.set(cuisine, (cuisines.get(cuisine) ?? 0) + 1);
    out.push(r);
  }
  return out;
}

/** Before opening any page: views (log scale), the creator's trust, and a little for known creators. */
export function cheapScore(c: Candidate, trust: Trust): number {
  const views = c.views === null ? 0.4 : clamp01(Math.log10(Math.max(1, c.views)) / 7);
  const known = c.origin.kind === 'followed' ? 0.2 : c.origin.kind === 'creator' ? 0.1 : 0;
  return views + 0.5 * trust(c) + known;
}

const originKey = (o: Origin): string => (o.kind === 'search' ? `search:${o.query}` : o.kind);

/**
 * The `n` videos worth opening: taken in turn from each search (and each kind of known creator), best
 * first within each, at most PER_CREATOR per creator, so that no single search fills the list.
 */
export function preselect(candidates: readonly Candidate[], n: number, trust: Trust): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = originKey(c.origin);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const queues = [...groups.values()].map((g) => g.map((c) => ({ c, s: cheapScore(c, trust) })).sort((a, b) => b.s - a.s).map((x) => x.c));
  const perCreator = new Map<string, number>();
  const picked: Candidate[] = [];
  while (picked.length < n && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      if (picked.length === n) break;
      while (queue.length > 0) {
        const c = queue.shift()!;
        const key = creatorKey(c);
        if ((perCreator.get(key) ?? 0) >= PER_CREATOR) continue;
        perCreator.set(key, (perCreator.get(key) ?? 0) + 1);
        picked.push(c);
        break;
      }
    }
  }
  return picked;
}
