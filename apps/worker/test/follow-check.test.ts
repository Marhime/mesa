// The daily look at followed creators: baseline, new recipe videos, saved and non-recipe ones, channels
// that fail, a bot check, and the job through processJob — with a fake channel source and a database
// that remembers what was stored.
import { describe, expect, it, vi } from 'vitest';

import { ImportError, MESSAGES } from '../src/errors';
import { checkFollows, followedRef, MAX_CHANNELS, type CreatorVideoRow, type FollowCheckOptions, type FollowedCreator } from '../src/follow-check';
import { processJob } from '../src/runner';
import { YtDlpError } from '../src/ytdlp';
import { listChannelVideos, type ChannelListing, type FlatVideo } from '../src/ytdlp-channel';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent } from './fake-deps';

// processJob runs the real yt-dlp source: only its listing call is replaced.
vi.mock('../src/ytdlp-channel', async (original) => ({ ...(await original<typeof import('../src/ytdlp-channel')>()), listChannelVideos: vi.fn() }));

const UC_A = 'UCE-NIVMcV8A2GwGcCYLSMDQ';
const UC_B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const id = (n: number): string => `vid${String(n).padStart(8, '0')}`;
const watch = (n: number): string => `https://www.youtube.com/watch?v=${id(n)}`;
const videosUrl = (uc: string): string => `https://www.youtube.com/channel/${uc}/videos`;

const video = (n: number, over: Partial<FlatVideo> = {}): FlatVideo => ({
  id: id(n), title: `Video ${n}`, description: null, views: 1000.4, duration: 300.6, liveStatus: null, availability: null, timestamp: null, short: false, ...over,
});
const listing = (videos: FlatVideo[]): ChannelListing => ({ name: 'Food is Love', channelId: null, videos });

const follow = (uc: string, name = 'Food is Love'): FollowedCreator => ({ channel_id: uc, url: `https://www.youtube.com/channel/${uc}`, name });

/** A household whose creator_videos are kept between runs. */
function household(follows: FollowedCreator[], saved: string[] = []) {
  const rows: CreatorVideoRow[] = [];
  const fake = fakeDb((c) => {
    if (c.table === 'followed_creators') return follows;
    if (c.table === 'recipes') return saved.map((source_url) => ({ source_url }));
    if (c.table !== 'creator_videos') return null;
    if (c.op === 'upsert') {
      for (const r of c.payload as CreatorVideoRow[]) if (!rows.some((x) => x.url === r.url)) rows.push(r);
      return null;
    }
    const channel = c.filters.find((f) => f[0] === 'eq' && f[1] === 'channel_id')?.[2];
    return rows.filter((r) => r.channel_id === channel).map((r) => ({ url: r.url }));
  });
  return { ...fake, rows };
}

function options(listings: Record<string, ChannelListing | Error>): FollowCheckOptions & { source: { list: ReturnType<typeof vi.fn> } } {
  return {
    source: {
      list: vi.fn(async (url: string) => {
        const answer = listings[url];
        if (!answer) throw new Error(`unexpected listing ${url}`);
        if (answer instanceof Error) throw answer;
        return answer;
      }),
    },
    pause: vi.fn(async () => undefined),
  };
}

const job = fakeJob({ kind: 'follow_check', input_text: 'daily' });
const signal = new AbortController().signal;
const verdicts = async () => ({
  videos: [
    { id: id(10), recipe: true, dish: 'Tinga de pollo 🌮' },
    { id: id(11), recipe: false, dish: null },
    { id: id(12), recipe: true, dish: 'Pozole' },
    { id: id(20), recipe: true, dish: 'Goulash' },
  ],
});
const promptOf = (askJson: unknown, call = 0): string =>
  (vi.mocked(askJson as (...a: unknown[]) => unknown).mock.calls[call]![0] as { parts: { text: string }[] }).parts[0]!.text;

describe('followedRef', () => {
  it('lists by channel id when there is one, else by the followed link', () => {
    expect(followedRef(follow(UC_A))).toEqual({ kind: 'channel', id: UC_A });
    expect(followedRef({ channel_id: '@FoodisLove', url: 'https://www.youtube.com/@FoodisLove', name: 'x' })).toEqual({ kind: 'handle', handle: 'FoodisLove' });
    expect(followedRef({ channel_id: 'nope', url: 'https://www.tiktok.com/@x', name: 'x' })).toBeNull();
  });
});

describe('follow check', () => {
  it('first look: stores every video as already there, without asking the model', async () => {
    const h = household([follow(UC_A), follow(UC_B, 'Lupita')]);
    const d = fakeDeps(h.db, verdicts);
    const opts = options({
      [videosUrl(UC_A)]: listing([video(1), video(2, { short: true }), video(3, { duration: 40 }), video(4, { liveStatus: 'is_upcoming', duration: null })]),
      [videosUrl(UC_B)]: listing([video(5)]),
    });
    const summary = await checkFollows(d, job, silent, signal, opts);

    expect(d.ai.askJson).not.toHaveBeenCalled();
    expect(opts.pause).toHaveBeenCalledTimes(1);
    expect(h.rows.map((r) => r.url)).toEqual([watch(1), watch(5)]);
    expect(h.rows.every((r) => !r.is_new && r.is_recipe)).toBe(true);
    expect(h.rows[0]).toEqual<CreatorVideoRow>({
      household_id: 'h1',
      channel_id: UC_A,
      url: watch(1),
      title: 'Video 1',
      dish: null,
      views: 1000,
      duration_s: 301,
      thumbnail: `https://i.ytimg.com/vi/${id(1)}/hqdefault.jpg`,
      is_recipe: true,
      is_new: false,
    });
    expect(summary).toEqual({ followed: 2, checked: 2, failed: 0, baselines: 2, new: 0, stopped: null });
    const query = h.calls.find((c) => c.table === 'followed_creators')!;
    expect(query.filters).toContainEqual(['eq', 'household_id', 'h1']);
    expect(query.filters).toContainEqual(['order', 'created_at', { ascending: true }]);
    expect(query.filters).toContainEqual(['limit', MAX_CHANNELS]);
  });

  it('next look: only unseen recipe videos are new; saved ones are not; non-recipes are kept as such', async () => {
    const h = household([follow(UC_A)], [watch(12)]);
    await checkFollows(fakeDeps(h.db, verdicts), job, silent, signal, options({ [videosUrl(UC_A)]: listing([video(1), video(2)]) }));
    expect(h.rows).toHaveLength(2);

    const d = fakeDeps(h.db, verdicts);
    const summary = await checkFollows(d, job, silent, signal, options({ [videosUrl(UC_A)]: listing([video(10), video(11), video(12), video(1), video(2)]) }));

    expect(d.ai.askJson).toHaveBeenCalledTimes(1);
    const prompt = promptOf(d.ai.askJson);
    expect(prompt).toContain('Creator: Food is Love');
    for (const n of [10, 11, 12]) expect(prompt).toContain(id(n));
    for (const n of [1, 2]) expect(prompt).not.toContain(id(n));
    expect(h.calls.find((c) => c.table === 'recipes')!.filters).toContainEqual(['in', 'source_url', [watch(10), watch(11), watch(12)]]);

    const byUrl = new Map(h.rows.map((r) => [r.url, r]));
    expect(byUrl.get(watch(10))).toMatchObject({ is_recipe: true, is_new: true, dish: 'Tinga de pollo' });
    expect(byUrl.get(watch(11))).toMatchObject({ is_recipe: false, is_new: false, dish: null });
    expect(byUrl.get(watch(12))).toMatchObject({ is_recipe: true, is_new: false, dish: 'Pozole' });
    expect(byUrl.get(watch(1))).toMatchObject({ is_new: false });
    expect(summary).toMatchObject({ checked: 1, baselines: 0, new: 1 });

    // Nothing unseen the day after: no model call, nothing written.
    const quiet = fakeDeps(h.db, verdicts);
    const upserts = h.calls.filter((c) => c.op === 'upsert').length;
    await checkFollows(quiet, job, silent, signal, options({ [videosUrl(UC_A)]: listing([video(10), video(11)]) }));
    expect(quiet.ai.askJson).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.op === 'upsert')).toHaveLength(upserts);
  });

  it('a channel that fails is skipped; the others are still looked at', async () => {
    const h = household([follow(UC_A), follow(UC_B, 'Lupita')]);
    const gone = new YtDlpError('ERROR: [youtube:tab] This channel does not exist.', 'exit code 1');
    const opts = options({ [videosUrl(UC_A)]: gone, [videosUrl(UC_B)]: listing([video(5)]) });
    const summary = await checkFollows(fakeDeps(h.db, verdicts), job, silent, signal, opts);

    expect(opts.source.list).toHaveBeenCalledTimes(2);
    expect(h.rows.map((r) => r.url)).toEqual([watch(5)]);
    expect(summary).toMatchObject({ checked: 1, failed: 1, stopped: null });
  });

  it('a busy model skips that channel only; its videos are asked about again tomorrow', async () => {
    const h = household([follow(UC_A), follow(UC_B, 'Lupita')]);
    await checkFollows(fakeDeps(h.db, verdicts), job, silent, signal, options({ [videosUrl(UC_A)]: listing([video(1)]), [videosUrl(UC_B)]: listing([video(5)]) }));

    let calls = 0;
    const busyOnce = async () => {
      calls += 1;
      if (calls === 1) throw new ImportError('aiBusy');
      return verdicts();
    };
    const summary = await checkFollows(fakeDeps(h.db, busyOnce), job, silent, signal, options({
      [videosUrl(UC_A)]: listing([video(10), video(1)]),
      [videosUrl(UC_B)]: listing([video(20), video(5)]),
    }));

    expect(h.rows.some((r) => r.url === watch(10))).toBe(false);
    expect(h.rows.find((r) => r.url === watch(20))).toMatchObject({ channel_id: UC_B, is_new: true, dish: 'Goulash' });
    expect(summary).toMatchObject({ checked: 1, failed: 1, new: 1 });
  });

  it('a bot check stops the run, keeping what was done', async () => {
    const h = household([follow(UC_A), follow(UC_B), follow('UCcccccccccccccccccccccc')]);
    const bot = new YtDlpError('ERROR: [youtube] Sign in to confirm you’re not a bot. Use --cookies…', 'exit code 1');
    const opts = options({ [videosUrl(UC_A)]: listing([video(1)]), [videosUrl(UC_B)]: bot });
    const summary = await checkFollows(fakeDeps(h.db, verdicts), job, silent, signal, opts);

    expect(opts.source.list).toHaveBeenCalledTimes(2);
    expect(h.rows.map((r) => r.url)).toEqual([watch(1)]);
    expect(summary).toEqual({ followed: 3, checked: 1, failed: 1, baselines: 1, new: 0, stopped: 'blocked' });
  });

  it('runs as a quiet background job: done, no push', async () => {
    vi.mocked(listChannelVideos).mockResolvedValueOnce(listing([video(1)]));
    const h = household([follow(UC_A)]);
    await processJob(fakeDeps(h.db, verdicts), job, silent, { shutdown: new AbortController().signal });

    expect(vi.mocked(listChannelVideos).mock.calls[0]![1]).toBe(videosUrl(UC_A));
    expect(h.rows.map((r) => r.url)).toEqual([watch(1)]);
    expect(jobUpdate(h.calls)).toMatchObject({ status: 'done', error: null, platform: 'youtube' });
    expect(h.calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });

  it('fails quietly when the follows cannot be read', async () => {
    const { db, calls } = fakeDb(() => null);
    const broken = { from: (table: string) => (table === 'followed_creators' ? { select: () => { throw new Error('db down'); } } : db.from(table)) };
    await processJob(fakeDeps(broken as unknown as typeof db, verdicts), job, silent, { shutdown: new AbortController().signal });

    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error_code: 'unknown', platform: 'youtube' });
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });
});
