// For you and Find me end to end, with a fake YouTube and model and a database that answers like the
// household's: what is searched, what is opened, what is left out, the rows written to `suggestions`,
// the FoundVideos answer, the budget and the bot-check stop, and both jobs through processJob.
import { describe, expect, it, vi } from 'vitest';

import { discoverFind, discoverForYou, MAX_CALLS, VERIFY, type DiscoverOptions } from '../src/discover';
import { PacedCalls, ytDlpDiscoverIO, type VideoSource } from '../src/discover-source';
import { ImportError, MESSAGES } from '../src/errors';
import type { JsonRequest } from '../src/gemini';
import { processJob } from '../src/runner';
import { askedReadyPush } from '../src/ready-pushes';
import { youtubeVideoId } from '../src/url';
import { YtDlpError } from '../src/ytdlp';
import type { ChannelListing } from '../src/ytdlp-channel';
import type { SearchHit, VideoDetails } from '../src/youtube-search';
import { hit, NOW_MS, page, uc, vid, watch } from './discover-helpers';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

// processJob builds the real yt-dlp source: it is replaced by the fake of each test.
vi.mock('../src/discover-source', async (original) => ({ ...(await original<typeof import('../src/discover-source')>()), ytDlpDiscoverIO: vi.fn() }));

const signal = new AbortController().signal;
const botCheck = (): YtDlpError => new YtDlpError("ERROR: Sign in to confirm you're not a bot", 'exit code 1');

interface World {
  searches?: Record<string, SearchHit[] | Error>;
  pages?: Record<string, Partial<VideoDetails> | Error>;
  uploads?: Record<string, ChannelListing>;
}

function fakeSource(world: World): VideoSource & { [K in keyof VideoSource]: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(async (q: string) => {
      const a = world.searches?.[q];
      if (a instanceof Error) throw a;
      return a ?? [];
    }),
    details: vi.fn(async (url: string) => {
      const id = youtubeVideoId(url)!;
      const a = world.pages?.[id];
      if (a instanceof Error) throw a;
      return page(id, a);
    }),
    uploads: vi.fn(async (channelId: string) => world.uploads?.[channelId] ?? { name: null, channelId: null, videos: [] }),
  };
}

const options = (source: VideoSource): DiscoverOptions & { pause: ReturnType<typeof vi.fn> } => ({ source, pause: vi.fn(async () => undefined), now: () => NOW_MS });

/** The model: `queries` for the searches; every video judged a recipe unless `verdicts` says otherwise. */
function model(queries: unknown, verdicts: Record<string, Record<string, unknown>> = {}) {
  return async (req: unknown, what: unknown) => {
    if (what !== 'discover_judge') return queries;
    const text = (req as JsonRequest).parts[0]!.text!;
    const ids = [...text.matchAll(/"id": "([^"]+)"/g)].map((m) => m[1]!);
    return {
      videos: ids.map((id) => ({ id, recipe: true, dish: `Dish ${id}`, cuisine: `Cuisine ${id}`, language: 'es', fit: 4, why: 'Like the tinga you made', ...verdicts[id] })),
    };
  };
}

interface Household {
  recipes?: unknown[];
  followed?: unknown[];
  suggestions?: unknown[];
  creatorVideos?: unknown[];
}

function household(h: Household = {}) {
  return fakeDb((c: Call) => {
    if (c.table === 'recipes') return h.recipes ?? [];
    if (c.table === 'followed_creators') return h.followed ?? [];
    if (c.table === 'suggestions') return c.op === 'select' ? (h.suggestions ?? []) : null;
    if (c.table === 'creator_videos') return h.creatorVideos ?? [];
    if (c.table === 'import_jobs') return c.op === 'select' ? { id: 'job-1' } : null;
    return [];
  });
}

const inserted = (calls: Call[]) => (calls.find((c) => c.table === 'suggestions' && c.op === 'upsert')?.payload ?? []) as Record<string, unknown>[];

const FOOD_IS_LOVE = uc('a');
/** A distinct valid channel id per number. */
const channel = (n: number): string => `UC${String(n).padStart(22, 'x')}`;
const FOLLOWED = uc('f');
const BAD_CHEF = uc('b');

/** A household that cooks with Food is Love, follows another cook, said "not for us" to Bad Chef. */
const kitchen: Household = {
  recipes: [
    { title: 'Tinga de pollo', source_url: watch(99), source_author: 'Food is Love', source_channel_id: FOOD_IS_LOVE, total_minutes: 35, is_favorite: true, last_cooked_at: '2026-11-01T20:00:00Z', created_at: '2026-10-01T00:00:00Z', language: 'es' },
  ],
  followed: [{ channel_id: FOLLOWED, name: 'Followed Cook' }],
  suggestions: [
    { url: watch(5), title: 'Egg hacks', dish: null, creator: 'Bad Chef', creator_channel_id: BAD_CHEF, status: 'dismissed' },
    { url: watch(6), title: 'Ramen', dish: 'Ramen', creator: 'Someone', creator_channel_id: uc('s'), status: 'new' },
  ],
  creatorVideos: [
    { url: watch(30), title: 'Pozole rojo', dish: 'Pozole rojo', views: 20_000, duration_s: 900, channel_id: FOLLOWED },
    { url: watch(6), title: 'Ramen', dish: 'Ramen', views: 20_000, duration_s: 900, channel_id: FOLLOWED },
    { url: watch(31), title: 'Not followed anymore', dish: null, views: 20_000, duration_s: 900, channel_id: uc('o') },
  ],
};

const forYouQueries = {
  queries: [
    { q: 'tinga de pollo receta', lang: 'es', dish: 'Chicken tinga' },
    { q: 'one pan chicken 30 min', lang: 'en', dish: 'One-pan chicken' },
    { q: 'khao soi recipe', lang: 'en', dish: 'Khao soi' },
  ],
};

const forYouWorld = (): World => ({
  searches: {
    'tinga de pollo receta': [hit(1), hit(2), hit(5), hit(99), hit(3, { channelId: uc('c'), channel: 'Cook C' })],
    'one pan chicken 30 min': [
      hit(4, { short: true, channelId: uc('d') }),
      hit(7, { views: 100, channelId: uc('d') }),
      hit(8, { duration: 30, channelId: uc('d') }),
      hit(1),
      hit(9, { channelId: uc('e'), channel: 'Cook E' }),
    ],
    'khao soi recipe': [hit(10, { channelId: BAD_CHEF, channel: 'Bad Chef' }), hit(11, { channelId: uc('g'), channel: 'Cook G' })],
  },
  pages: { [vid(11)]: new YtDlpError('ERROR: Video unavailable', 'exit code 1'), [vid(2)]: { followers: 50_000_000, views: 6_000, likes: 10 } },
  uploads: { [FOOD_IS_LOVE]: { name: 'Food is Love', channelId: FOOD_IS_LOVE, videos: [{ ...hit(40), description: null }] } },
});

describe('For you', () => {
  it('writes the best real recipe videos to suggestions, with a why, at most 2 per creator', async () => {
    const { db, calls } = household(kitchen);
    const deps = fakeDeps(db, model(forYouQueries, { [vid(9)]: { recipe: false, why: 'A vlog' } }));
    const source = fakeSource(forYouWorld());
    const opts = options(source);
    const summary = await discoverForYou(deps, fakeJob({ kind: 'for_you', input_text: 'weekly' }), silent, signal, opts);

    expect(deps.ai.askJson).toHaveBeenCalledTimes(2);
    expect(source.search.mock.calls.map((c) => c[0])).toEqual(['tinga de pollo receta', 'one pan chicken 30 min', 'khao soi recipe']);
    expect(source.uploads).toHaveBeenCalledWith(FOOD_IS_LOVE, signal);
    const opened = source.details.mock.calls.map((c) => youtubeVideoId(c[0] as string));
    for (const left of [4, 5, 6, 7, 8, 99]) expect(opened).not.toContain(vid(left));
    expect(opts.pause).toHaveBeenCalledTimes(summary.ytdlp_calls - 1);

    const rows = inserted(calls);
    const urls = rows.map((r) => r.url);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(urls).toContain(watch(30));
    for (const left of [4, 5, 6, 7, 8, 9, 11, 99]) expect(urls).not.toContain(watch(left));
    const perCreator = new Map<unknown, number>();
    for (const r of rows) perCreator.set(r.creator_channel_id, (perCreator.get(r.creator_channel_id) ?? 0) + 1);
    expect(Math.max(...perCreator.values())).toBeLessThanOrEqual(2);
    // Scores come out best first; the dismissed creator never beats a trusted one.
    expect(rows.map((r) => r.score)).toEqual([...rows.map((r) => r.score as number)].sort((a, b) => b - a));

    const pozole = rows.find((r) => r.url === watch(30))!;
    expect(pozole).toEqual({
      household_id: 'h1',
      job_id: 'job-1',
      url: watch(30),
      platform: 'youtube',
      title: 'Pozole rojo',
      creator: 'Followed Cook',
      creator_channel_id: FOLLOWED,
      thumbnail: `https://i.ytimg.com/vi/${vid(30)}/hqdefault.jpg`,
      duration_s: 600,
      views: 120_000,
      language: 'es',
      dish: `Dish ${vid(30)}`,
      why: 'Like the tinga you made',
      score: expect.any(Number),
      status: 'new',
    });
    expect(pozole).not.toHaveProperty('expires_at');
    expect(calls.find((c) => c.op === 'upsert')).toBeDefined();
    expect(summary).toMatchObject({ queries: 3, followed: 1, stopped: null, chosen: rows.length });
    expect(summary.ytdlp_calls).toBeLessThanOrEqual(MAX_CALLS);
    expect(summary.verified).toBeLessThanOrEqual(VERIFY.for_you);
  });

  it('stops calling YouTube at a bot check and keeps what it has', async () => {
    const { db, calls } = household(kitchen);
    const deps = fakeDeps(db, model(forYouQueries));
    const source = fakeSource({ searches: { 'tinga de pollo receta': botCheck() } });
    const summary = await discoverForYou(deps, fakeJob({ kind: 'for_you' }), silent, signal, options(source));

    expect(source.search).toHaveBeenCalledTimes(1);
    expect(source.details).not.toHaveBeenCalled();
    expect(source.uploads).not.toHaveBeenCalled();
    expect(inserted(calls).map((r) => r.url)).toEqual([watch(30)]);
    expect(inserted(calls)[0]).toMatchObject({ views: 20_000, duration_s: 900 });
    expect(summary).toMatchObject({ stopped: 'blocked', ytdlp_calls: 1, ytdlp_failed: 1, verified: 0, chosen: 1 });
  });

  it('writes nothing, and asks the judge nothing, when nothing passes', async () => {
    const { db, calls } = household({});
    const deps = fakeDeps(db, model({ queries: [{ q: 'tinga', lang: 'es', dish: null }] }));
    const source = fakeSource({ searches: { tinga: [hit(1, { views: 10 })] } });
    const summary = await discoverForYou(deps, fakeJob({ kind: 'for_you' }), silent, signal, options(source));
    expect(deps.ai.askJson).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
    expect(summary).toMatchObject({ chosen: 0, dropped: { few_views: 1 } });
  });

  it('never makes more than MAX_CALLS yt-dlp calls', async () => {
    const queries = { queries: Array.from({ length: 6 }, (_, i) => ({ q: `query ${i}`, lang: 'en', dish: null })) };
    const searches = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`query ${i}`, Array.from({ length: 8 }, (_, j) => hit(i * 10 + j + 100, { channelId: channel(i * 10 + j), channel: `Cook ${i * 10 + j}` }))]),
    );
    const { db } = household(kitchen);
    const source = fakeSource({ searches, uploads: { [FOOD_IS_LOVE]: { name: 'Food is Love', channelId: FOOD_IS_LOVE, videos: [hit(200)] } } });
    const summary = await discoverForYou(fakeDeps(db, model(queries)), fakeJob({ kind: 'for_you' }), silent, signal, options(source));
    const total = source.search.mock.calls.length + source.details.mock.calls.length + source.uploads.mock.calls.length;
    expect(total).toBe(summary.ytdlp_calls);
    expect(total).toBeLessThanOrEqual(MAX_CALLS);
    expect(source.details.mock.calls.length).toBe(VERIFY.for_you);
  });
});

describe('PacedCalls', () => {
  it('pauses between calls, stops at its budget, and makes no call after a bot check', async () => {
    const pause = vi.fn(async () => undefined);
    const calls = new PacedCalls(pause, 3, silent);
    const fn = vi.fn(async () => 'ok');
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await calls.run('x', fn, signal));
    expect(answers).toEqual(['ok', 'ok', 'ok', null, null]);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(pause).toHaveBeenCalledTimes(2);

    const blocked = new PacedCalls(pause, 10, silent);
    expect(await blocked.run('x', async () => { throw new YtDlpError('ERROR: Video unavailable', 'exit 1'); }, signal)).toBeNull();
    expect(blocked.canCall).toBe(true);
    expect(await blocked.run('x', async () => { throw botCheck(); }, signal)).toBeNull();
    expect(await blocked.run('x', fn, signal)).toBeNull();
    expect({ blocked: blocked.blocked, calls: blocked.calls, failed: blocked.failed, left: blocked.left }).toEqual({ blocked: true, calls: 2, failed: 2, left: 0 });
  });

  it('rethrows an abort instead of counting it as a failure', async () => {
    const ctrl = new AbortController();
    ctrl.abort(new DOMException('stop', 'AbortError'));
    const calls = new PacedCalls(async () => undefined, 3, silent);
    await expect(calls.run('x', async () => { throw new DOMException('stop', 'AbortError'); }, ctrl.signal)).rejects.toThrow('stop');
    expect(calls.failed).toBe(0);
  });
});

const findQueries = {
  queries: [
    { q: 'pollo enchilado receta', lang: 'es', dish: 'Spicy chicken' },
    { q: 'spicy chicken 30 min', lang: 'en', dish: 'Spicy chicken' },
  ],
};

describe('Find me', () => {
  const world = (): World => ({
    searches: {
      'pollo enchilado receta': [hit(1), hit(2, { channelId: uc('c'), channel: 'Cook C' }), hit(99), hit(5)],
      'spicy chicken 30 min': [hit(6, { channelId: uc('s'), channel: 'Someone' }), hit(7, { channelId: uc('d'), channel: 'Cook D' })],
    },
  });

  it('answers FoundVideos for the wish: saved and dismissed links left out, what misses the wish too', async () => {
    const { db } = household(kitchen);
    const deps = fakeDeps(db, model(findQueries, { [vid(7)]: { fit: 2 } }));
    const source = fakeSource(world());
    const result = await discoverFind(deps, fakeJob({ kind: 'find', input_text: '  spicy chicken,\n30 min ' }), silent, signal, options(source));

    expect(deps.ai.askJson).toHaveBeenCalledTimes(2);
    expect(result.query).toBe('spicy chicken, 30 min');
    expect(result.videos.map((v) => v.url).sort()).toEqual([watch(1), watch(2), watch(6)]);
    expect(result.videos.find((v) => v.url === watch(1))).toEqual({
      url: watch(1),
      platform: 'youtube',
      title: 'Video 1',
      creator: 'Food is Love',
      creator_channel_id: FOOD_IS_LOVE,
      thumbnail: `https://i.ytimg.com/vi/${vid(1)}/hqdefault.jpg`,
      duration_s: 600,
      views: 120_000,
      language: 'es',
      dish: `Dish ${vid(1)}`,
      why: 'Like the tinga you made',
    });
    expect(source.uploads).not.toHaveBeenCalled();
    expect(source.details.mock.calls.length).toBeLessThanOrEqual(VERIFY.find);
  });

  it('searches the wish itself when the model gave no search', async () => {
    const { db } = household({});
    const source = fakeSource({ searches: { 'pozole verde': [hit(1)] } });
    const result = await discoverFind(fakeDeps(db, model({ queries: [] })), fakeJob({ kind: 'find', input_text: 'pozole verde' }), silent, signal, options(source));
    expect(source.search).toHaveBeenCalledWith('pozole verde', signal);
    expect(result.videos).toHaveLength(1);
  });

  it('says there is nothing good, or that it could not search, in its own words', async () => {
    const nothing = household({});
    const noRecipe = fakeDeps(nothing.db, model(findQueries, { [vid(1)]: { recipe: false } }));
    await expect(
      discoverFind(noRecipe, fakeJob({ kind: 'find', input_text: 'spicy chicken' }), silent, signal, options(fakeSource({ searches: { 'pollo enchilado receta': [hit(1)] } }))),
    ).rejects.toMatchObject({ userMessage: MESSAGES.findNothing });

    const blocked = fakeSource({ searches: { 'pollo enchilado receta': botCheck() } });
    await expect(discoverFind(fakeDeps(nothing.db, model(findQueries)), fakeJob({ kind: 'find', input_text: 'spicy chicken' }), silent, signal, options(blocked))).rejects.toMatchObject({
      userMessage: MESSAGES.findFailed,
    });
    expect(blocked.search).toHaveBeenCalledTimes(1);

    const empty = fakeDeps(nothing.db, model(findQueries));
    await expect(discoverFind(empty, fakeJob({ kind: 'find', input_text: '   ' }), silent, signal, options(fakeSource({})))).rejects.toBeInstanceOf(ImportError);
    expect(empty.ai.askJson).not.toHaveBeenCalled();
  });
});

describe('the push for Find me', () => {
  const video = (dish: string | null, title: string) => ({ url: 'u', platform: 'youtube' as const, title, creator: null, creator_channel_id: null, thumbnail: null, duration_s: 600, views: 1, language: 'es', dish, why: 'w' });

  it('says how many videos were found for the wish, names the dishes, and reopens the job', () => {
    const push = askedReadyPush('find', 'job-7', { query: 'spicy chicken, 30 min', videos: [video('Pollo enchilado', 'A'), video(null, 'Chicken 65'), video('Tinga', 'C'), video('Birria', 'D')] }, null);
    expect(push).toEqual({ title: 'Found 4 videos for “spicy chicken, 30 min”', body: 'Pollo enchilado · Chicken 65 · Tinga', data: { jobId: 'job-7', kind: 'find' } });
    expect(askedReadyPush('find', 'j', { query: 'x'.repeat(60), videos: [video('Tinga', 'A')] }, null).title).toBe(`Found 1 video for “${'x'.repeat(39)}…”`);
  });
});

describe('through processJob', () => {
  const run = async (deps: ReturnType<typeof fakeDeps>, job: ReturnType<typeof fakeJob>, source: VideoSource) => {
    vi.mocked(ytDlpDiscoverIO).mockReturnValue({ source, pause: async () => undefined });
    await processJob(deps, job, silent, { shutdown: new AbortController().signal });
  };

  it('for_you runs quietly in the background: suggestions written, job done, no push', async () => {
    const { db, calls } = household(kitchen);
    await run(fakeDeps(db, model(forYouQueries)), fakeJob({ kind: 'for_you', input_text: 'weekly' }), fakeSource(forYouWorld()));
    expect(inserted(calls).length).toBeGreaterThan(0);
    expect(jobUpdate(calls)).toMatchObject({ status: 'done', error: null, platform: 'youtube' });
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });

  it('a failed for_you is logged as failed, without a push', async () => {
    const { db, calls } = household(kitchen);
    const deps = fakeDeps(db, async () => {
      throw new ImportError('aiBusy');
    });
    await run(deps, fakeJob({ kind: 'for_you' }), fakeSource({}));
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error_code: 'aiBusy', platform: 'youtube' });
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });

  it('find answers in result, and pushes when the person waited long', async () => {
    const { db, calls } = household(kitchen);
    const job = fakeJob({ kind: 'find', input_text: 'spicy chicken', created_at: new Date(Date.now() - 60_000).toISOString() });
    await run(fakeDeps(db, model(findQueries)), job, fakeSource({ searches: { 'pollo enchilado receta': [hit(1)] } }));
    const update = jobUpdate(calls);
    expect(update).toMatchObject({ status: 'done', error: null, platform: 'youtube', result: { query: 'spicy chicken' } });
    expect((update.result as { videos: unknown[] }).videos).toHaveLength(1);
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(true);
  });

  it('find fails with "nothing good" kept as its own code', async () => {
    const { db, calls } = household({});
    await run(fakeDeps(db, model(findQueries)), fakeJob({ kind: 'find', input_text: 'spicy chicken' }), fakeSource({}));
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error: MESSAGES.findNothing, error_code: 'findNothing', platform: 'youtube' });
  });
});
