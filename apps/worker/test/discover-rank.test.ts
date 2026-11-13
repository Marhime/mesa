// For you / Find me: the cheap filters, dedupe, and the ranking (quality relative to channel size, trust,
// novelty, fit floor) with its diversity caps, and which pages are worth opening.
import { describe, expect, it } from 'vitest';

import { excludedLinks, filterCandidates, MAX_SECONDS, MIN_SECONDS, MIN_VIEWS, rejection } from '../src/discover-filter';
import { CREATOR_WEIGHT } from '../src/discover-profile';
import { creatorTrust, diversify, novelty, preselect, quality, rankVideos, scoreOf, type Ranked } from '../src/discover-rank';
import { candidate, DAY_S, NOW_MS, NOW_S, uc, verdict, vid, watch } from './discover-helpers';

describe('rejection', () => {
  it('keeps YouTube recipe-length videos with enough views, and says why it drops the others', () => {
    expect(rejection(candidate(1), true)).toBeNull();
    expect(rejection(candidate(1, { url: 'https://vimeo.com/123' }), false)).toBe('not_youtube');
    expect(rejection(candidate(1, { short: true }), false)).toBe('short');
    expect(rejection(candidate(1, { liveStatus: 'is_live' }), false)).toBe('live');
    expect(rejection(candidate(1, { liveStatus: 'was_live' }), false)).toBe('live');
    expect(rejection(candidate(1, { availability: 'subscriber_only' }), false)).toBe('locked');
    expect(rejection(candidate(1, { duration: MIN_SECONDS - 1 }), false)).toBe('too_short');
    expect(rejection(candidate(1, { duration: MAX_SECONDS + 1 }), false)).toBe('too_long');
    expect(rejection(candidate(1, { views: MIN_VIEWS - 1 }), false)).toBe('few_views');
  });

  it('includes the limits, and lets unknowns through until nothing more will be learned', () => {
    expect(rejection(candidate(1, { duration: MIN_SECONDS, views: MIN_VIEWS }), true)).toBeNull();
    expect(rejection(candidate(1, { duration: MAX_SECONDS }), true)).toBeNull();
    expect(rejection(candidate(1, { duration: null, views: null }), false)).toBeNull();
    expect(rejection(candidate(1, { duration: null }), true)).toBe('no_duration');
    expect(rejection(candidate(1, { views: null }), true)).toBe('no_views');
  });
});

describe('filterCandidates', () => {
  it('keeps each video once (first seen), drops known links, and counts why', () => {
    const list = [candidate(1), candidate(2), candidate(1, { origin: { kind: 'search', query: 'q2' } }), candidate(3, { short: true }), candidate(4)];
    const { kept, dropped } = filterCandidates(list, new Set([watch(4)]), false);
    expect(kept.map((c) => c.id)).toEqual([vid(1), vid(2)]);
    expect(kept[0]!.origin).toEqual({ kind: 'search', query: 'q1' });
    expect(dropped).toEqual({ duplicate: 1, short: 1, known: 1 });
  });

  it('leaves out every earlier suggestion weekly, but only the dismissed ones for Find me', () => {
    const known = { saved: new Set(['s']), suggested: new Set(['n', 'd']), dismissed: new Set(['d']) };
    expect([...excludedLinks(known, 'for_you')].sort()).toEqual(['d', 'n', 's']);
    expect([...excludedLinks(known, 'find')].sort()).toEqual(['d', 's']);
  });
});

describe('quality', () => {
  it('is σ(ln views − 0.8·ln followers): a small channel’s hit beats a big channel’s dud', () => {
    expect(quality({ views: 100_000, followers: 1_000_000, likes: null })).toBeCloseTo(1 / (1 + Math.exp(-(Math.log(1e5) - 0.8 * Math.log(1e6)))), 6);
    expect(quality({ views: 50_000, followers: 10_000, likes: null })).toBeGreaterThan(quality({ views: 50_000, followers: 5_000_000, likes: null }));
  });

  it('blends in the like rate, and is careful with what it does not know', () => {
    const loved = quality({ views: 100_000, followers: 1_000_000, likes: 4_000 });
    const meh = quality({ views: 100_000, followers: 1_000_000, likes: 200 });
    expect(loved).toBeGreaterThan(meh);
    expect(quality({ views: 100_000, followers: 1, likes: 10_000 })).toBeLessThanOrEqual(1);
    expect(quality({ views: 100_000, followers: null, likes: null })).toBe(0.5);
    expect(quality({ views: null, followers: 1000, likes: 10 })).toBe(0.3);
  });
});

describe('novelty', () => {
  it('favors recent uploads', () => {
    expect(novelty(NOW_S - 10 * DAY_S, NOW_MS)).toBe(1);
    expect(novelty(NOW_S - 400 * DAY_S, NOW_MS)).toBeLessThan(1);
    expect(novelty(NOW_S - 400 * DAY_S, NOW_MS)).toBeGreaterThan(novelty(NOW_S - 800 * DAY_S, NOW_MS));
    expect(novelty(NOW_S - 5000 * DAY_S, NOW_MS)).toBe(0.2);
    expect(novelty(null, NOW_MS)).toBe(0.5);
  });
});

describe('creatorTrust', () => {
  const trust = creatorTrust([
    { channelId: uc('a'), name: 'Food is Love', weight: CREATOR_WEIGHT.cooked + CREATOR_WEIGHT.saved },
    { channelId: uc('a'), name: 'Food is Love', weight: CREATOR_WEIGHT.followed },
    { channelId: uc('b'), name: 'Bad Chef', weight: CREATOR_WEIGHT.dismissed },
    { channelId: null, name: 'Abuela Rosa', weight: CREATOR_WEIGHT.saved },
  ]);

  it('raises cooked, followed and saved creators, lowers dismissed ones, and is neutral otherwise', () => {
    expect(trust({ channelId: uc('a'), channel: null })).toBeGreaterThan(0.8);
    expect(trust({ channelId: uc('b'), channel: 'Bad Chef' })).toBeLessThan(0.5);
    expect(trust({ channelId: null, channel: 'abuela  ROSA' })).toBeGreaterThan(0.5);
    expect(trust({ channelId: uc('z'), channel: 'Someone' })).toBe(0.5);
  });
});

describe('rankVideos and diversify', () => {
  const neutral = creatorTrust([]);

  it('orders by score and leaves out what fits too little', () => {
    const list = [candidate(1), candidate(2), candidate(3)];
    const verdicts = new Map([
      [vid(1), verdict({ fit: 0.5 })],
      [vid(2), verdict({ fit: 1 })],
      [vid(3), verdict({ fit: 0.25 })],
    ]);
    const ranked = rankVideos(list, verdicts, neutral, NOW_MS, 0.5);
    expect(ranked.map((r) => r.candidate.id)).toEqual([vid(2), vid(1)]);
    expect(ranked[0]!.score).toBe(scoreOf({ fit: 1, quality: 0.5, trust: 0.5, novelty: 0.5 }));
  });

  it('puts a trusted creator ahead of an unknown one with the same video', () => {
    const trust = creatorTrust([{ channelId: uc('a'), name: null, weight: CREATOR_WEIGHT.followed }]);
    const list = [candidate(1, { channelId: uc('z'), channel: 'Someone' }), candidate(2)];
    const v = new Map([[vid(1), verdict()], [vid(2), verdict()]]);
    expect(rankVideos(list, v, trust, NOW_MS).map((r) => r.candidate.id)).toEqual([vid(2), vid(1)]);
  });

  it('keeps at most 2 per creator and 2 per cuisine (unknown cuisines uncapped), best first', () => {
    const r = (n: number, channel: string, cuisine: string | null, score: number): Ranked => ({
      candidate: candidate(n, { channelId: uc(channel), channel }),
      verdict: verdict({ cuisine }),
      score,
    });
    const ranked = [
      r(1, 'a', 'Mexican', 0.9),
      r(2, 'a', 'Thai', 0.85),
      r(3, 'a', 'Italian', 0.8),
      r(4, 'b', 'mexican', 0.75),
      r(5, 'c', 'Mexican', 0.7),
      r(6, 'd', null, 0.65),
      r(7, 'e', null, 0.6),
      r(8, 'f', 'Thai', 0.55),
    ];
    expect(diversify(ranked, 5).map((x) => x.candidate.id)).toEqual([vid(1), vid(2), vid(4), vid(6), vid(7)]);
    expect(diversify(ranked, 10).map((x) => x.candidate.id)).toEqual([vid(1), vid(2), vid(4), vid(6), vid(7), vid(8)]);
    expect(diversify(ranked, 2)).toHaveLength(2);
  });
});

describe('preselect', () => {
  it('takes from each search in turn, best first, at most 2 per creator', () => {
    const neutral = creatorTrust([]);
    const a = [1, 2, 3, 4, 5].map((n) => candidate(n, { channelId: uc(String.fromCharCode(96 + n)), views: n * 10_000 }));
    const b = [candidate(10, { origin: { kind: 'search', query: 'q2' }, channelId: uc('x'), views: 6_000 })];
    const followed = [candidate(20, { origin: { kind: 'followed' }, channelId: uc('y') })];
    const sameCreator = [21, 22, 23].map((n) => candidate(n, { origin: { kind: 'search', query: 'q3' }, channelId: uc('k') }));

    const picked = preselect([...a, ...b, ...followed, ...sameCreator], 6, neutral).map((c) => c.id);
    expect(picked).toHaveLength(6);
    expect(picked.slice(0, 4)).toEqual([vid(5), vid(10), vid(20), vid(21)]);
    expect(picked).toContain(vid(4));
    expect(picked.filter((id) => [vid(21), vid(22), vid(23)].includes(id)).length).toBeLessThanOrEqual(2);
    expect(preselect(a, 0, neutral)).toEqual([]);
  });
});
