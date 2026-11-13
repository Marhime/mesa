import { describe, expect, it } from 'vitest';
import { ImportError } from '../src/errors';
import { detectPlatform, extractFirstUrl, normalizeUrl, parseHttpUrl, youtubeVideoId } from '../src/url';
import { fetchVideoMeta, videoLink } from '../src/ytdlp';
import { listChannelVideos } from '../src/ytdlp-channel';

describe('detectPlatform', () => {
  it.each([
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'youtube'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://www.instagram.com/reel/C9xYz123AbC/?igsh=MWQ1ZGUxMzBkMA==', 'instagram'],
    ['https://instagram.com/p/C9xYz123AbC/', 'instagram'],
    ['https://www.tiktok.com/@cocinaconmama/video/7412345678901234567', 'tiktok'],
    ['https://vm.tiktok.com/ZMhAbCdEf/', 'tiktok'],
    ['https://www.facebook.com/reel/1234567890', 'other'],
    ['https://fb.watch/abcDEF/', 'other'],
    ['https://pin.it/3xYzAbC', 'other'],
    ['https://www.kiwilimon.com/receta/platos-fuertes/tinga-de-pollo', 'web'],
    ['https://cocina.example/recetas/pozole?utm_source=wa', 'web'],
  ])('%s → %s', (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
});

describe('normalizeUrl', () => {
  it.each([
    // YouTube variants all become the watch URL
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ?si=Xy12AbCdEfGh', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=Xy12AbCdEfGh', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ&t=42s&list=PL123', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?si=1', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    // Instagram: no query, canonical host and path
    ['https://www.instagram.com/reel/C9xYz123AbC/?igsh=MWQ1ZGUxMzBkMA==', 'https://www.instagram.com/reel/C9xYz123AbC/'],
    ['https://instagram.com/reels/C9xYz123AbC?utm_source=ig_web_copy_link', 'https://www.instagram.com/reel/C9xYz123AbC/'],
    ['https://www.instagram.com/cocinaconlupita/reel/C9xYz123AbC/?hl=es', 'https://www.instagram.com/reel/C9xYz123AbC/'],
    ['https://www.instagram.com/p/C9xYz123AbC/?img_index=2&igsh=abc', 'https://www.instagram.com/p/C9xYz123AbC/'],
    // TikTok: no query
    [
      'https://www.tiktok.com/@cocinaconmama/video/7412345678901234567?is_from_webapp=1&sender_device=pc&web_id=123',
      'https://www.tiktok.com/@cocinaconmama/video/7412345678901234567',
    ],
    ['https://vm.tiktok.com/ZMhAbCdEf/', 'https://vm.tiktok.com/ZMhAbCdEf/'],
    // websites: tracking parameters and fragments go, real parameters stay
    ['https://cocina.example/recetas/pozole/?utm_source=whatsapp&utm_medium=share#comments', 'https://cocina.example/recetas/pozole/'],
    ['https://cocina.example/?p=123&fbclid=IwAR0abc&gclid=xyz', 'https://cocina.example/?p=123'],
    ['https://Cocina.Example/Receta?id=7&si=abc&ref=home', 'https://cocina.example/Receta?id=7'],
    ['www.kiwilimon.com/receta/tinga', 'https://www.kiwilimon.com/receta/tinga'],
  ])('%s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe('youtubeVideoId', () => {
  it('reads ids from every link shape and rejects bad ones', () => {
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/@channel')).toBeNull();
    expect(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('extractFirstUrl', () => {
  it('finds the link in shared text', () => {
    expect(extractFirstUrl('Mira esta receta 😋 https://www.instagram.com/reel/C9xYz123AbC/?igsh=abc')).toBe(
      'https://www.instagram.com/reel/C9xYz123AbC/?igsh=abc',
    );
    expect(extractFirstUrl('Check this out: https://vm.tiktok.com/ZMhAbCdEf/.')).toBe('https://vm.tiktok.com/ZMhAbCdEf/');
    expect(extractFirstUrl('(receta: https://cocina.example/pozole)')).toBe('https://cocina.example/pozole');
    expect(extractFirstUrl('https://es.wikipedia.org/wiki/Mole_(salsa)')).toBe('https://es.wikipedia.org/wiki/Mole_(salsa)');
    expect(extractFirstUrl('ver www.kiwilimon.com/receta/tinga, está buena')).toBe('www.kiwilimon.com/receta/tinga');
  });

  it('returns null for text without a link', () => {
    expect(extractFirstUrl('2 tazas de harina\n1 huevo')).toBeNull();
    expect(extractFirstUrl('Precio: 3.5 kg a 20.00')).toBeNull();
  });

  it('parseHttpUrl accepts only http(s)', () => {
    expect(parseHttpUrl('ftp://example.com/x')).toBeNull();
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
    expect(parseHttpUrl('https://example.com/x')?.hostname).toBe('example.com');
  });
});

describe('videoLink (what yt-dlp is ever given)', () => {
  it('takes the video hosts the pipelines send it', () => {
    for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/channel/UCE-NIVMcV8A2GwGcCYLSMDQ/videos', 'https://www.instagram.com/reel/C9xYz123AbC/', 'https://vm.tiktok.com/ZMhAbCdEf/', 'https://pin.it/3xYzAbC']) {
      expect(videoLink(url)).toBe(url);
    }
  });

  it('refuses websites, addresses, other ports and anything that is not an http(s) link', () => {
    for (const url of ['https://cocina.example/recetas/pozole', 'http://localhost/x', 'http://127.0.0.1/watch?v=dQw4w9WgXcQ', 'http://169.254.169.254/', 'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ', 'https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ', 'file:///etc/passwd', 'www.youtube.com/watch?v=dQw4w9WgXcQ', '--exec=sh']) {
      expect(() => videoLink(url), url).toThrow(ImportError);
    }
  });

  it('is checked before yt-dlp runs', async () => {
    const opts = { path: 'yt-dlp-not-run-in-tests', cookies: null };
    await expect(fetchVideoMeta(opts, 'http://10.0.0.1/clip.mp4', '/nonexistent')).rejects.toMatchObject({ code: 'unsupportedLink' });
    await expect(listChannelVideos(opts, 'https://evil.example/@chef', '/nonexistent')).rejects.toMatchObject({ code: 'unsupportedLink' });
  });
});
