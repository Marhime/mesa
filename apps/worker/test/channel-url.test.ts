import type { ImportJob } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { channelPageUrl, channelVideosUrl, isYouTubeListLink, parseChannelUrl } from '../src/channel-url';
import { MESSAGES } from '../src/errors';
import { runImport } from '../src/pipeline';
import { fakeDb, fakeDeps, fakeJob, silent } from './fake-deps';

const UC = 'UCE-NIVMcV8A2GwGcCYLSMDQ';

describe('parseChannelUrl', () => {
  it('reads every channel form', () => {
    expect(parseChannelUrl(`https://www.youtube.com/channel/${UC}`)).toEqual({ kind: 'channel', id: UC });
    expect(parseChannelUrl(`https://m.youtube.com/channel/${UC}/featured?si=abc`)).toEqual({ kind: 'channel', id: UC });
    expect(parseChannelUrl('https://www.youtube.com/@FoodisLove')).toEqual({ kind: 'handle', handle: 'FoodisLove' });
    expect(parseChannelUrl('youtube.com/@food.is-love_1/shorts')).toEqual({ kind: 'handle', handle: 'food.is-love_1' });
    expect(parseChannelUrl('https://www.youtube.com/@caf%C3%A9maison/videos')).toEqual({ kind: 'handle', handle: 'cafémaison' });
    expect(parseChannelUrl('https://www.youtube.com/c/FoodisLove/videos')).toEqual({ kind: 'custom', name: 'FoodisLove' });
    expect(parseChannelUrl('http://youtube.com/user/foodislove')).toEqual({ kind: 'user', name: 'foodislove' });
  });

  it('reads playlists', () => {
    expect(parseChannelUrl('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toEqual({
      kind: 'playlist',
      id: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG',
    });
    expect(parseChannelUrl('https://music.youtube.com/playlist?list=OLAK5uy_abc')).toEqual({ kind: 'playlist', id: 'OLAK5uy_abc' });
  });

  it('leaves videos, other sites and unknown pages alone', () => {
    expect(parseChannelUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8')).toBeNull();
    expect(parseChannelUrl('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/channel/not-an-id')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/results?search_query=tinga')).toBeNull();
    expect(parseChannelUrl('https://www.youtube.com/@')).toBeNull();
    expect(parseChannelUrl('https://www.instagram.com/foodislove/')).toBeNull();
    expect(parseChannelUrl('https://notyoutube.com/@foodislove')).toBeNull();
    expect(parseChannelUrl('not a link')).toBeNull();
  });

  it('builds the page and the Videos tab to list', () => {
    expect(channelPageUrl({ kind: 'channel', id: UC })).toBe(`https://www.youtube.com/channel/${UC}`);
    expect(channelVideosUrl({ kind: 'channel', id: UC })).toBe(`https://www.youtube.com/channel/${UC}/videos`);
    expect(channelVideosUrl({ kind: 'handle', handle: 'cafémaison' })).toBe('https://www.youtube.com/@caf%C3%A9maison/videos');
    expect(channelVideosUrl({ kind: 'custom', name: 'FoodisLove' })).toBe('https://www.youtube.com/c/FoodisLove/videos');
    expect(channelVideosUrl({ kind: 'user', name: 'foodislove' })).toBe('https://www.youtube.com/user/foodislove/videos');
    expect(channelVideosUrl({ kind: 'playlist', id: 'PL123' })).toBe('https://www.youtube.com/playlist?list=PL123');
  });
});

describe('a channel shared as a recipe', () => {
  const importOf = (over: Partial<ImportJob>) =>
    runImport(fakeDeps(fakeDb(() => null).db, async () => ({})), fakeJob({ kind: 'recipe', ...over }), silent, new AbortController().signal);

  it('fails fast, saying to open it as a creator, even with a long caption', async () => {
    expect(isYouTubeListLink('https://www.youtube.com/@FoodisLove')).toBe(true);
    await expect(importOf({ input_url: 'https://www.youtube.com/@FoodisLove' })).rejects.toMatchObject({ userMessage: MESSAGES.creatorLink });
    await expect(
      importOf({ input_text: `Look at all these recipes!!! So many good dinners for the week https://youtube.com/playlist?list=PL123abc` }),
    ).rejects.toMatchObject({ userMessage: MESSAGES.creatorLink });
  });
});
