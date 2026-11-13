// Stand-ins shared by the For you / Find me tests: ids, candidates, search hits, video pages, verdicts.
import type { Candidate } from '../src/discover-candidates';
import type { Verdict } from '../src/discover-judge';
import type { SearchHit, VideoDetails } from '../src/youtube-search';

export const NOW_MS = Date.parse('2026-11-06T12:00:00Z');
export const NOW_S = NOW_MS / 1000;
export const DAY_S = 86_400;

/** A valid UC… channel id from one letter. */
export const uc = (letter: string): string => `UC${letter.repeat(22)}`;
export const vid = (n: number): string => `vid${String(n).padStart(8, '0')}`;
export const watch = (n: number): string => `https://www.youtube.com/watch?v=${vid(n)}`;

export const candidate = (n: number, over: Partial<Candidate> = {}): Candidate => ({
  id: vid(n),
  url: watch(n),
  title: `Video ${n}`,
  channel: 'Food is Love',
  channelId: uc('a'),
  description: null,
  duration: 600,
  views: 50_000,
  likes: null,
  followers: null,
  uploadedAt: null,
  language: null,
  dish: null,
  thumbnail: `https://i.ytimg.com/vi/${vid(n)}/hqdefault.jpg`,
  short: false,
  liveStatus: null,
  availability: null,
  origin: { kind: 'search', query: 'q1' },
  verified: false,
  ...over,
});

export const hit = (n: number, over: Partial<SearchHit> = {}): SearchHit => ({
  id: vid(n),
  title: `Video ${n}`,
  description: null,
  views: 50_000,
  duration: 600,
  liveStatus: null,
  availability: null,
  timestamp: null,
  short: false,
  channel: 'Food is Love',
  channelId: uc('a'),
  ...over,
});

export const page = (id: string, over: Partial<VideoDetails> = {}): VideoDetails => ({
  id,
  title: null,
  description: 'Ingredients: chicken, chiles…',
  duration: 600,
  views: 120_000,
  likes: 3_000,
  followers: 300_000,
  uploadedAt: NOW_S - 30 * DAY_S,
  channel: null,
  channelId: null,
  language: null,
  liveStatus: 'not_live',
  availability: 'public',
  short: false,
  ...over,
});

export const verdict = (over: Partial<Verdict> = {}): Verdict => ({ dish: 'Tinga', cuisine: 'Mexican', language: 'es', fit: 0.75, why: 'Like the tinga you made', ...over });
