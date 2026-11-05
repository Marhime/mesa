import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '../src/catalog-store';
import { ConfigError, loadConfig } from '../src/config';
import { sniffImage } from '../src/http';
import { failureMessages, unregisteredTokens } from '../src/push';
import { parseYtDlpInfo, ytDlpErrorMessage } from '../src/ytdlp';
import { MESSAGES } from '../src/errors';

const env = {
  SUPABASE_URL: 'https://abcd1234.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc123',
  GEMINI_API_KEY: 'AIzaSyTest',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(env)).toEqual({
      supabaseUrl: 'https://abcd1234.supabase.co',
      supabaseServiceRoleKey: 'sb_secret_abc123',
      geminiApiKey: 'AIzaSyTest',
      geminiModel: 'gemini-3.8-flash',
      geminiFallbackModels: ['gemini-3.6-flash', 'gemini-3.5-flash'],
      pollIntervalMs: 3000,
      ytdlpPath: 'yt-dlp',
      ytdlpCookies: null,
      concurrency: 1,
      logLevel: 'info',
      expoAccessToken: null,
    });
  });

  it('reads fallback models without duplicates or the main model, and "none" turns them off', () => {
    const list = loadConfig({ ...env, GEMINI_MODEL: 'gemini-a', GEMINI_FALLBACK_MODELS: ' gemini-b, gemini-a ,, gemini-b,gemini-c ' });
    expect(list.geminiFallbackModels).toEqual(['gemini-b', 'gemini-c']);
    expect(loadConfig({ ...env, GEMINI_FALLBACK_MODELS: 'NONE' }).geminiFallbackModels).toEqual([]);
  });

  it('lists every problem at once', () => {
    const anonJwt = `x.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.y`;
    try {
      loadConfig({ SUPABASE_URL: 'not a url', SUPABASE_SERVICE_ROLE_KEY: anonJwt, GEMINI_API_KEY: 'YOUR-GEMINI-API-KEY', WORKER_CONCURRENCY: '0', POLL_INTERVAL_MS: 'soon' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const problems = (err as ConfigError).problems.join('\n');
      expect(problems).toContain('SUPABASE_URL');
      expect(problems).toContain('role "anon"');
      expect(problems).toContain('GEMINI_API_KEY still has the placeholder');
      expect(problems).toContain('WORKER_CONCURRENCY');
      expect(problems).toContain('POLL_INTERVAL_MS');
    }
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL is required/);
  });
});

describe('fetchAllPages', () => {
  it('pages with .range() until a short page', async () => {
    const all = Array.from({ length: 2350 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllPages<number>((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    });
    expect(rows).toEqual(all);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

describe('yt-dlp metadata', () => {
  it('reads a single video', () => {
    const meta = parseYtDlpInfo({
      title: 'Video by cocinaconlupita',
      description: 'Tinga 🔥\nIngredientes:\n- 2 pechugas',
      thumbnail: 'https://scontent.cdninstagram.com/thumb.jpg',
      duration: 58.4,
      formats: [{ format_id: 'dash-audio', vcodec: 'none', acodec: 'mp4a' }, { format_id: '720', vcodec: 'avc1', ext: 'mp4' }],
    });
    expect(meta).toEqual({
      title: 'Video by cocinaconlupita',
      description: 'Tinga 🔥\nIngredientes:\n- 2 pechugas',
      thumbnail: 'https://scontent.cdninstagram.com/thumb.jpg',
      duration: 58.4,
      hasVideo: true,
      videoIndex: null,
      imageUrls: [],
    });
  });

  it('reads an image-only carousel', () => {
    const meta = parseYtDlpInfo({
      _type: 'playlist',
      title: 'Post by cocinaconlupita',
      description: 'Receta en las fotos',
      entries: [
        { thumbnails: [{ url: 'https://cdn/a-small.jpg' }, { url: 'https://cdn/a-big.jpg' }], formats: [] },
        { thumbnail: 'https://cdn/b.jpg' },
      ],
    });
    expect(meta.hasVideo).toBe(false);
    expect(meta.imageUrls).toEqual(['https://cdn/a-big.jpg', 'https://cdn/b.jpg']);
    expect(meta.description).toBe('Receta en las fotos');
  });

  it('finds the first video in a mixed carousel', () => {
    const meta = parseYtDlpInfo({
      _type: 'playlist',
      entries: [{ thumbnail: 'https://cdn/a.jpg' }, { thumbnail: 'https://cdn/v.jpg', duration: 30, formats: [{ vcodec: 'h264' }] }],
    });
    expect(meta).toMatchObject({ hasVideo: true, videoIndex: 2, duration: 30, thumbnail: 'https://cdn/v.jpg' });
  });

  it('turns stderr into a short message', () => {
    expect(ytDlpErrorMessage('ERROR: [Instagram] C9x: Requested content is not available, rate-limit reached or login required')).toBe(MESSAGES.videoPrivate);
    expect(ytDlpErrorMessage('ERROR: [TikTok] 123: Video not available, status code 10204')).toBe(MESSAGES.videoFailed);
    expect(ytDlpErrorMessage('ERROR: Unsupported URL: https://example.com')).toBe(MESSAGES.unsupportedLink);
    expect(ytDlpErrorMessage('ERROR: HTTP Error 404: Not Found')).toBe(MESSAGES.videoUnavailable);
  });
});

describe('push', () => {
  it('builds the failure message and finds DeviceNotRegistered tokens', () => {
    expect(failureMessages(['ExponentPushToken[a]'], 'job-1')).toEqual([
      { to: 'ExponentPushToken[a]', title: "Couldn't read this recipe", body: 'Send a screenshot or paste the text instead.', data: { jobId: 'job-1' }, sound: 'default' },
    ]);
    const tokens = ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]'];
    const response = {
      data: [
        { status: 'ok', id: '1' },
        { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
      ],
    };
    expect(unregisteredTokens(tokens, response)).toEqual(['ExponentPushToken[b]']);
    expect(unregisteredTokens(tokens, { errors: [{ code: 'X' }] })).toEqual([]);
  });
});

describe('sniffImage', () => {
  it('detects formats from magic bytes', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe('png');
    expect(sniffImage(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1'))?.ext).toBe('webp');
    expect(sniffImage(Buffer.from('\u0000\u0000\u0000\u0018ftypheic', 'latin1'))?.ext).toBe('heic');
    expect(sniffImage(Buffer.from('<html>', 'latin1'))).toBeNull();
  });
});
