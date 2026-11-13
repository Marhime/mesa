// A creator's latest recipe videos: the yt-dlp listing, what is kept, the model's batch answer, and the
// job end to end with a fake channel source and database.
import type { CreatorVideos } from '@mesa/shared';
import { describe, expect, it, vi } from 'vitest';

import { findCreatorVideos, type ChannelSource } from '../src/creator';
import { candidateVideos, cleanDish, creatorUserPrompt, creatorVideoList, MAX_VIDEOS, recipeVerdicts } from '../src/creator-videos';
import { ImportError, MESSAGES } from '../src/errors';
import { processJob } from '../src/runner';
import { YtDlpError } from '../src/ytdlp';
import { listChannelVideos, parseFlatPlaylist, type ChannelListing, type FlatVideo } from '../src/ytdlp-channel';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

// processJob runs the real yt-dlp source: only its listing call is replaced.
vi.mock('../src/ytdlp-channel', async (original) => ({ ...(await original<typeof import('../src/ytdlp-channel')>()), listChannelVideos: vi.fn() }));

const UC = 'UCE-NIVMcV8A2GwGcCYLSMDQ';
const id = (n: number): string => `vid${String(n).padStart(8, '0')}`;

/** One line of `yt-dlp --flat-playlist --dump-json` on a channel's Videos tab. */
const line = (n: number, over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    _type: 'url',
    ie_key: 'Youtube',
    id: id(n),
    url: `https://www.youtube.com/watch?v=${id(n)}`,
    title: `Video ${n}`,
    description: null,
    view_count: 1000 * n,
    duration: 300,
    channel_id: null,
    playlist_id: UC,
    playlist_title: 'Food is Love - Videos',
    playlist_uploader: 'Food is Love',
    playlist_uploader_id: '@FoodisLove',
    playlist_channel: 'Food is Love',
    playlist_channel_id: UC,
    ...over,
  });

const video = (n: number, over: Partial<FlatVideo> = {}): FlatVideo => ({
  id: id(n), title: `Video ${n}`, description: null, views: null, duration: 300, liveStatus: null, availability: null, timestamp: null, short: false, ...over,
});

describe('parseFlatPlaylist', () => {
  it('reads the channel and its videos, in order, skipping what is not a video', () => {
    const stdout = [
      line(1, { title: 'Hungarian paprika chicken', view_count: 68000, duration: 525, description: 'Creamy, smoky…' }),
      'WARNING: not json',
      line(2, { title: '[Private video]' }),
      line(3, { _type: 'url', ie_key: 'YoutubeTab', id: 'UCsomeotherchannel00000', title: 'Other channel' }),
      line(4, { url: `https://www.youtube.com/shorts/${id(4)}`, duration: 40 }),
      line(5, { live_status: 'is_upcoming', duration: null }),
      '',
    ].join('\n');
    const listing = parseFlatPlaylist(stdout);
    expect(listing.name).toBe('Food is Love');
    expect(listing.channelId).toBe(UC);
    expect(listing.videos.map((v) => v.id)).toEqual([id(1), id(4), id(5)]);
    expect(listing.videos[0]).toEqual({
      id: id(1), title: 'Hungarian paprika chicken', description: 'Creamy, smoky…', views: 68000, duration: 525,
      liveStatus: null, availability: null, timestamp: null, short: false,
    });
    expect(listing.videos[1]!.short).toBe(true);
    expect(listing.videos[2]).toMatchObject({ liveStatus: 'is_upcoming', duration: null });
  });

  it('falls back to the entry channel, and reads dates when given', () => {
    const listing = parseFlatPlaylist(
      JSON.stringify({ id: id(1), title: 'Tinga', channel: 'Lupita', channel_id: UC, upload_date: '20261101' }),
    );
    expect(listing).toMatchObject({ name: 'Lupita', channelId: UC });
    expect(listing.videos[0]!.timestamp).toBe(Date.UTC(2026, 10, 1) / 1000);
    expect(parseFlatPlaylist('')).toEqual({ name: null, channelId: null, videos: [] });
  });
});

describe('candidateVideos', () => {
  it('drops Shorts, clips under 90 s, lives, members-only and repeats; keeps the listing order', () => {
    const kept = candidateVideos([
      video(1),
      video(2, { duration: 89 }),
      video(3, { short: true, duration: 120 }),
      video(4, { liveStatus: 'is_live', duration: null }),
      video(5, { liveStatus: 'was_live', duration: 7200 }),
      video(6, { availability: 'subscriber_only' }),
      video(7, { duration: 90 }),
      video(1),
      video(8, { duration: null }),
    ]);
    expect(kept.map((v) => v.id)).toEqual([id(1), id(7), id(8)]);
  });

  it('puts the newest first when every video has a date', () => {
    const kept = candidateVideos([video(1, { timestamp: 100 }), video(2, { timestamp: 300 }), video(3, { timestamp: 200 })]);
    expect(kept.map((v) => v.id)).toEqual([id(2), id(3), id(1)]);
    const undated = candidateVideos([video(1, { timestamp: 100 }), video(2), video(3, { timestamp: 200 })]);
    expect(undated.map((v) => v.id)).toEqual([id(1), id(2), id(3)]);
  });
});

describe('the model batch answer', () => {
  const asked = new Set([id(1), id(2), id(3)]);

  it('keeps recipe verdicts for asked ids, once each, with a clean dish', () => {
    const verdicts = recipeVerdicts(
      {
        videos: [
          { id: id(1), recipe: true, dish: '  🔥 Hungarian paprika chicken! #easy ' },
          { id: id(2), recipe: false, dish: null },
          { id: id(1), recipe: false, dish: null },
          { id: 'unknown0000', recipe: true, dish: 'Ghost' },
          { id: ` ${id(3)} `, recipe: true, dish: '' },
          null,
        ],
      },
      asked,
    );
    expect([...verdicts!]).toEqual([
      [id(1), 'Hungarian paprika chicken'],
      [id(3), null],
    ]);
  });

  it('tells an unreadable answer from "no recipes"', () => {
    expect(recipeVerdicts({ videos: [] }, asked)!.size).toBe(0);
    expect(recipeVerdicts({ nope: true }, asked)).toBeNull();
    expect(recipeVerdicts(null, asked)).toBeNull();
    expect(recipeVerdicts({ videos: [{ id: id(1), recipe: 'true' }] }, asked)!.size).toBe(0);
  });

  it('cleans dish names', () => {
    expect(cleanDish('"Tinga de pollo" 🌮🇲🇽')).toBe('Tinga de pollo');
    expect(cleanDish('x'.repeat(100))).toHaveLength(60);
    expect(cleanDish(42)).toBeNull();
    expect(cleanDish(' #shorts ')).toBeNull();
  });

  it('asks with titles and short descriptions', () => {
    const prompt = creatorUserPrompt('Food is Love', [video(1, { title: 'Paprikás csirke', description: 'd'.repeat(500) })]);
    expect(prompt).toContain('Creator: Food is Love');
    expect(prompt).toContain('"title": "Paprikás csirke"');
    expect(prompt).toContain(`"description": "${'d'.repeat(200)}"`);
    expect(prompt).not.toContain('d'.repeat(201));
  });
});

describe('creatorVideoList', () => {
  it('keeps recipes in order, at most 20, with thumbnail, rounded numbers and the saved flag', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => video(i + 1, { views: 1234.0, duration: 525.4 }));
    const verdicts = new Map(candidates.filter((_, i) => i !== 1).map((v) => [v.id, `Dish ${v.id}`] as [string, string]));
    const list = creatorVideoList(candidates, verdicts, new Set([`https://www.youtube.com/watch?v=${id(3)}`]));
    expect(list).toHaveLength(MAX_VIDEOS);
    expect(list.map((v) => v.url).slice(0, 2)).toEqual([`https://www.youtube.com/watch?v=${id(1)}`, `https://www.youtube.com/watch?v=${id(3)}`]);
    expect(list[1]).toEqual({
      url: `https://www.youtube.com/watch?v=${id(3)}`,
      title: 'Video 3',
      dish: `Dish ${id(3)}`,
      views: 1234,
      duration_s: 525,
      thumbnail: `https://i.ytimg.com/vi/${id(3)}/hqdefault.jpg`,
      saved: true,
    });
    expect(list[0]!.saved).toBe(false);
  });
});

// The job ------------------------------------------------------------------------------------------

const listing = (videos: FlatVideo[]): ChannelListing => ({ name: 'Food is Love', channelId: UC, videos });

function fakeSource(over: Partial<ChannelSource> = {}): ChannelSource {
  return {
    list: vi.fn(async () => listing([video(1, { title: 'Hungarian paprika chicken', views: 68000, duration: 525 }), video(2, { title: 'My kitchen tour' }), video(3, { duration: 30 })])),
    videoAuthor: vi.fn(async () => ({ name: 'Food is Love', channelUrl: `https://www.youtube.com/channel/${UC}`, channelId: UC })),
    ...over,
  };
}

const answer = async () => ({
  videos: [
    { id: id(1), recipe: true, dish: 'Hungarian paprika chicken' },
    { id: id(2), recipe: false, dish: null },
  ],
});

describe('creator job', () => {
  it('lists a channel link: recipes only, saved marked, one model call', async () => {
    const { db, calls } = fakeDb((c) => (c.table === 'recipes' ? [{ source_url: `https://www.youtube.com/watch?v=${id(1)}` }] : null));
    const d = fakeDeps(db, answer);
    const source = fakeSource();
    const result = await findCreatorVideos(d, fakeJob({ kind: 'creator', input_url: 'https://youtube.com/@FoodisLove?si=x' }), silent, new AbortController().signal, source);

    expect(source.list).toHaveBeenCalledWith('https://www.youtube.com/@FoodisLove/videos', expect.anything());
    expect(source.videoAuthor).not.toHaveBeenCalled();
    expect(d.ai.askJson).toHaveBeenCalledTimes(1);
    const prompt = (vi.mocked(d.ai.askJson).mock.calls[0]![0] as { parts: { text: string }[] }).parts[0]!.text;
    expect(prompt).not.toContain(id(3));
    expect(calls.find((c) => c.table === 'recipes')!.filters).toContainEqual(['in', 'source_url', [`https://www.youtube.com/watch?v=${id(1)}`]]);
    expect(result).toEqual<CreatorVideos>({
      creator: { name: 'Food is Love', url: `https://www.youtube.com/channel/${UC}`, channel_id: UC, platform: 'youtube' },
      videos: [
        {
          url: `https://www.youtube.com/watch?v=${id(1)}`,
          title: 'Hungarian paprika chicken',
          dish: 'Hungarian paprika chicken',
          views: 68000,
          duration_s: 525,
          thumbnail: `https://i.ytimg.com/vi/${id(1)}/hqdefault.jpg`,
          saved: true,
        },
      ],
    });
  });

  it('from a recipe without a channel: finds it from the video and remembers it on the recipe', async () => {
    const recipe = { id: 'r1', source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source_platform: 'youtube', source_author: null, source_channel_url: null, source_channel_id: null };
    const { db, calls } = fakeDb((c) => (c.table === 'recipes' && c.op === 'select' && c.filters.some((f) => f[0] === 'maybeSingle') ? recipe : null));
    const source = fakeSource();
    await findCreatorVideos(fakeDeps(db, answer), fakeJob({ kind: 'creator', subject_id: 'r1' }), silent, new AbortController().signal, source);

    expect(source.videoAuthor).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ', expect.anything());
    expect(source.list).toHaveBeenCalledWith(`https://www.youtube.com/channel/${UC}/videos`, expect.anything());
    const update = calls.find((c) => c.table === 'recipes' && c.op === 'update')!;
    expect(update.payload).toEqual({ source_author: 'Food is Love', source_channel_url: `https://www.youtube.com/channel/${UC}`, source_channel_id: UC });
    expect(update.filters).toContainEqual(['eq', 'household_id', 'h1']);
  });

  it('from a recipe that knows its channel: no video lookup, nothing rewritten', async () => {
    const recipe = { id: 'r1', source_url: null, source_platform: 'youtube', source_author: 'Food is Love', source_channel_url: `https://www.youtube.com/channel/${UC}`, source_channel_id: UC };
    const { db, calls } = fakeDb((c) => (c.table === 'recipes' && c.filters.some((f) => f[0] === 'maybeSingle') ? recipe : null));
    const source = fakeSource({ list: vi.fn(async () => ({ name: null, channelId: null, videos: [] })) });
    const d = fakeDeps(db, answer);
    const result = await findCreatorVideos(d, fakeJob({ kind: 'creator', subject_id: 'r1' }), silent, new AbortController().signal, source);

    expect(source.videoAuthor).not.toHaveBeenCalled();
    expect(d.ai.askJson).not.toHaveBeenCalled();
    expect(calls.some((c) => c.op === 'update')).toBe(false);
    expect(result).toEqual({ creator: { name: 'Food is Love', url: `https://www.youtube.com/channel/${UC}`, channel_id: UC, platform: 'youtube' }, videos: [] });
  });

  it('says what went wrong: not YouTube, gone, or try again', async () => {
    const run = async (input_url: string, source: ChannelSource) =>
      findCreatorVideos(fakeDeps(fakeDb(() => null).db, answer), fakeJob({ kind: 'creator', input_url }), silent, new AbortController().signal, source);

    await expect(run('https://www.instagram.com/foodislove/', fakeSource())).rejects.toMatchObject({ userMessage: MESSAGES.creatorUnsupported });
    const gone = fakeSource({ list: vi.fn(async () => { throw new YtDlpError('ERROR: [youtube:tab] @nobody: This channel does not exist.', 'exit code 1'); }) });
    await expect(run('https://www.youtube.com/@nobody', gone)).rejects.toMatchObject({ userMessage: MESSAGES.creatorNotFound });
    const blocked = fakeSource({ list: vi.fn(async () => { throw new YtDlpError('ERROR: Sign in to confirm you’re not a bot', 'exit code 1'); }) });
    await expect(run('https://www.youtube.com/@FoodisLove', blocked)).rejects.toMatchObject({ userMessage: MESSAGES.creatorFailed });
  });
});

describe('creator job through processJob', () => {
  const run = (calls: ReturnType<typeof fakeDb>, input: { input_url?: string; subject_id?: string }, askJson = answer) =>
    processJob(fakeDeps(calls.db, askJson), fakeJob({ kind: 'creator', ...input }), silent, { shutdown: new AbortController().signal });

  it('keeps "only YouTube" and the platform, without a push', async () => {
    const fake = fakeDb(() => null);
    await run(fake, { input_url: 'https://www.tiktok.com/@foodislove' });
    expect(jobUpdate(fake.calls)).toMatchObject({ status: 'failed', error: MESSAGES.creatorUnsupported, error_code: 'creatorUnsupported', platform: 'tiktok' });
    expect(fake.calls.some((c: Call) => c.table === 'push_tokens')).toBe(false);
  });

  it('a recipe from a website has no channel to browse', async () => {
    const fake = fakeDb((c) => (c.table === 'recipes' ? { id: 'r1', source_url: 'https://cooking.example/tinga', source_platform: 'web', source_author: 'Lupita', source_channel_url: null, source_channel_id: null } : null));
    await run(fake, { subject_id: 'r1' });
    expect(jobUpdate(fake.calls)).toMatchObject({ status: 'failed', error_code: 'creatorUnsupported', platform: 'youtube' });
  });

  it('writes the videos on the job', async () => {
    vi.mocked(listChannelVideos).mockResolvedValueOnce(listing([video(1, { title: 'Hungarian paprika chicken' }), video(2)]));
    const fake = fakeDb(() => null);
    await run(fake, { input_url: `https://www.youtube.com/channel/${UC}` });
    expect(vi.mocked(listChannelVideos).mock.calls[0]![1]).toBe(`https://www.youtube.com/channel/${UC}/videos`);
    expect(jobUpdate(fake.calls)).toMatchObject({
      status: 'done',
      error: null,
      platform: 'youtube',
      result: { creator: { name: 'Food is Love', channel_id: UC }, videos: [{ title: 'Hungarian paprika chicken', dish: 'Hungarian paprika chicken', saved: false }] },
    });
  });

  it('anything else is "try again"; a busy model says so', async () => {
    const missing = fakeDb(() => null);
    await run(missing, { subject_id: 'r404' });
    expect(jobUpdate(missing.calls)).toMatchObject({ status: 'failed', error: MESSAGES.creatorFailed, error_code: 'creatorFailed' });

    vi.mocked(listChannelVideos).mockResolvedValueOnce(listing([video(1)]));
    const busy = fakeDb(() => null);
    await run(busy, { input_url: 'https://www.youtube.com/@FoodisLove' }, async () => {
      throw new ImportError('aiBusy');
    });
    expect(jobUpdate(busy.calls)).toMatchObject({ status: 'failed', error: MESSAGES.aiBusy, error_code: 'aiBusy' });
  });
});
