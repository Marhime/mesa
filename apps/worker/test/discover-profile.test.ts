// For you / Find me: the household's taste from its rows (what weighs most, its language, the foods to
// use soon, the links it already has), and how yt-dlp's search results and video pages are read.
import { describe, expect, it } from 'vitest';

import { buildTaste, CREATOR_WEIGHT, householdLanguage, loadTaste, soonFoods, type RecipeRow, type TasteRows } from '../src/discover-profile';
import { isoLanguage, parseSearchResults, parseVideoDetails } from '../src/youtube-search';
import { YtDlpError } from '../src/ytdlp';
import { NOW_MS, uc, vid, watch } from './discover-helpers';
import { fakeDb } from './fake-deps';

const today = new Date(NOW_MS);

const recipe = (title: string, over: Partial<RecipeRow> = {}): RecipeRow => ({
  title,
  source_url: null,
  source_author: null,
  source_channel_id: null,
  total_minutes: null,
  is_favorite: false,
  last_cooked_at: null,
  created_at: '2026-11-01T00:00:00Z',
  language: 'es',
  ...over,
});

describe('householdLanguage', () => {
  it('is the language most recipes are in (the most recent on a tie), else English', () => {
    expect(householdLanguage(['fr', 'es', 'es-MX', null, 'en'])).toBe('es');
    expect(householdLanguage(['fr', 'en', 'en', 'fr'])).toBe('fr');
    expect(householdLanguage([null, 'Spanish'])).toBe('en');
    expect(householdLanguage([])).toBe('en');
  });
});

describe('soonFoods', () => {
  it('lists what expires within 5 days, once per name, soonest first', () => {
    expect(
      soonFoods(
        [
          { name_en: 'Milk', expires_on: '2026-11-20' },
          { name_en: 'Poblano', expires_on: '2026-11-09' },
          { name_en: 'poblano', expires_on: '2026-11-08' },
          { name_en: 'Crema', expires_on: '2026-11-11' },
          { name_en: 'Old bread', expires_on: '2026-11-01' },
          { name_en: 'Rice', expires_on: null },
        ],
        today,
      ),
    ).toEqual([
      { name: 'poblano', expiresOn: '2026-11-08' },
      { name: 'Crema', expiresOn: '2026-11-11' },
    ]);
  });
});

describe('buildTaste', () => {
  const rows: TasteRows = {
    recipes: [
      recipe('Pad kra pao', { language: 'th', source_url: 'https://youtu.be/vid00000001?si=abc' }),
      recipe('Tinga de pollo', { last_cooked_at: '2026-11-01T20:00:00Z', source_author: 'Food is Love', source_channel_id: uc('a'), total_minutes: 35 }),
      recipe('Mole', { is_favorite: true, source_author: 'Abuela Rosa', source_channel_id: uc('r') }),
      recipe('Pozole', { last_cooked_at: '2026-11-05T20:00:00Z', source_author: 'Followed Cook', source_channel_id: uc('f') }),
      recipe('Sopa', { last_cooked_at: '2026-10-01T20:00:00Z', source_author: 'Insta cook', source_channel_id: '12345' }),
    ],
    followed: [{ channel_id: uc('f'), name: 'Followed Cook' }, { channel_id: 'not-a-channel', name: 'Broken' }],
    pantry: [{ name_en: 'Poblano', expires_on: '2026-11-08' }],
    suggestions: [
      { url: watch(5), title: 'Egg hacks', dish: null, creator: 'Bad Chef', creator_channel_id: uc('b'), status: 'dismissed' },
      { url: watch(6), title: 'Birria', dish: 'Birria', creator: 'Food is Love', creator_channel_id: uc('a'), status: 'saved' },
      { url: watch(7), title: 'Ramen', dish: 'Ramen', creator: null, creator_channel_id: null, status: 'new' },
    ],
  };
  const taste = buildTaste(rows, today);

  it('puts cooked and favorite recipes first (most recently cooked first), then the rest saved lately', () => {
    expect(taste.profile.cooked.map((r) => r.title)).toEqual(['Pozole', 'Tinga de pollo', 'Sopa', 'Mole']);
    expect(taste.profile.cooked[1]).toEqual({ title: 'Tinga de pollo', creator: 'Food is Love', minutes: 35 });
    expect(taste.profile.recent.map((r) => r.title)).toEqual(['Pad kra pao']);
    expect(taste.profile.language).toBe('es');
    expect(taste.profile.followed).toEqual(['Followed Cook']);
    expect(taste.profile.soon).toEqual([{ name: 'Poblano', expiresOn: '2026-11-08' }]);
    expect(taste.profile.liked).toEqual(['Birria — Food is Love']);
    expect(taste.profile.disliked).toEqual(['Egg hacks — Bad Chef']);
  });

  it('knows the links the household has, normalized like recipes.source_url', () => {
    expect([...taste.known.saved]).toEqual([`https://www.youtube.com/watch?v=${vid(1)}`]);
    expect([...taste.known.suggested]).toEqual([watch(5), watch(6), watch(7)]);
    expect([...taste.known.dismissed]).toEqual([watch(5)]);
  });

  it('lists the YouTube creators it cooks from but does not follow, most trusted first', () => {
    expect(taste.followed).toEqual([{ channelId: uc('f'), name: 'Followed Cook' }]);
    expect(taste.cookedCreators).toEqual([
      { channelId: uc('a'), name: 'Food is Love' },
      { channelId: uc('r'), name: 'Abuela Rosa' },
    ]);
  });

  it('turns what the household did into creator signals', () => {
    const forCreator = (id: string) => taste.creators.filter((s) => s.channelId === id).reduce((n, s) => n + s.weight, 0);
    expect(forCreator(uc('a'))).toBeCloseTo(CREATOR_WEIGHT.saved + CREATOR_WEIGHT.cooked + CREATOR_WEIGHT.kept);
    expect(forCreator(uc('f'))).toBeCloseTo(CREATOR_WEIGHT.saved + CREATOR_WEIGHT.cooked + CREATOR_WEIGHT.followed);
    expect(forCreator(uc('b'))).toBeCloseTo(CREATOR_WEIGHT.dismissed);
    expect(taste.creators.find((s) => s.name === 'Insta cook')!.channelId).toBeNull();
  });
});

describe('loadTaste', () => {
  it('reads the four tables for this household only, with the recipe language', async () => {
    const { db, calls } = fakeDb((c) => (c.table === 'recipes' ? [recipe('Tinga', { language: 'fr' })] : []));
    const taste = await loadTaste(db, 'h1', today);
    expect(taste.profile.language).toBe('fr');
    expect(calls.map((c) => c.table).sort()).toEqual(['followed_creators', 'pantry_status', 'recipes', 'suggestions']);
    for (const c of calls) expect(c.filters).toContainEqual(['eq', 'household_id', 'h1']);
    expect(String(calls.find((c) => c.table === 'recipes')!.filters[0]![1])).toContain('language:original->>language');
    expect(calls.find((c) => c.table === 'pantry_status')!.filters).toContainEqual(['not', 'state', 'in', '("out","gone")']);
  });
});

describe('yt-dlp search and video pages', () => {
  it('reads flat search results with their channel, flags Shorts, skips the rest', () => {
    const lines = [
      JSON.stringify({ ie_key: 'Youtube', id: vid(1), url: watch(1), title: 'Tinga de pollo', view_count: 120000, duration: 612, channel: 'Food is Love', channel_id: uc('a') }),
      JSON.stringify({ ie_key: 'Youtube', id: vid(2), url: `https://www.youtube.com/shorts/${vid(2)}`, title: 'Tinga in 30s', view_count: 9e6, duration: 31, uploader: 'Shorty', channel_id: 'nope' }),
      JSON.stringify({ ie_key: 'YoutubeTab', id: uc('z'), url: 'https://www.youtube.com/channel/x', title: 'A channel' }),
      'not json',
      '',
    ].join('\n');
    const hits = parseSearchResults(lines);
    expect(hits.map((h) => h.id)).toEqual([vid(1), vid(2)]);
    expect(hits[0]).toMatchObject({ title: 'Tinga de pollo', views: 120000, duration: 612, channel: 'Food is Love', channelId: uc('a'), short: false });
    expect(hits[1]).toMatchObject({ short: true, channel: 'Shorty', channelId: null });
  });

  it('reads the numbers that tell a loved video, and spots Shorts and past lives', () => {
    const d = parseVideoDetails({
      id: vid(1),
      title: 'Tinga',
      description: `Ingredientes:\n\n- pollo ${'x'.repeat(600)}`,
      duration: 612,
      view_count: 120000,
      like_count: 4100,
      channel_follower_count: 2_300_000,
      upload_date: '20261001',
      channel: 'Food is Love',
      channel_id: uc('a'),
      language: 'es-419',
      live_status: 'not_live',
      availability: 'public',
      width: 1920,
      height: 1080,
    });
    expect(d).toMatchObject({ id: vid(1), views: 120000, likes: 4100, followers: 2_300_000, language: 'es', short: false, liveStatus: 'not_live' });
    expect(d.uploadedAt).toBe(Date.UTC(2026, 9, 1) / 1000);
    expect(d.description!.startsWith('Ingredientes: - pollo')).toBe(true);
    expect(d.description!.length).toBe(400);

    expect(parseVideoDetails({ id: vid(2), media_type: 'short', duration: 150 }).short).toBe(true);
    expect(parseVideoDetails({ id: vid(3), width: 720, height: 1280, duration: 90 }).short).toBe(true);
    expect(parseVideoDetails({ id: vid(4), width: 720, height: 1280, duration: 900 }).short).toBe(false);
    expect(parseVideoDetails({ id: vid(5), was_live: true }).liveStatus).toBe('was_live');
    expect(() => parseVideoDetails({ title: 'no id' })).toThrow(YtDlpError);
  });

  it('keeps only ISO 639-1 language codes', () => {
    expect(['en', 'en-US', 'pt_BR', 'ZH-Hans', 'English', '', null].map(isoLanguage)).toEqual(['en', 'en', 'pt', 'zh', null, null, null]);
  });
});
