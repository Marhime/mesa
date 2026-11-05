// Link handling: find a URL in shared text, normalize it, and decide which pipeline reads it.

/** web = recipe website; other = a video/social host that yt-dlp can read. */
export type UrlPlatform = 'youtube' | 'instagram' | 'tiktok' | 'web' | 'other';

const TRACKING_PARAMS = new Set([
  'feature', 'si', 'igsh', 'igshid', 'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'ttclid',
  'mc_cid', 'mc_eid', 'ref', 'ref_src', 'ref_url', '_ga', '_gl', 'share_id', 'sender_device', 'sender_web_id',
  'is_from_webapp', 'web_id', 'mibextid', 'rdid', 'xmt', 'pp',
]);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Video and social hosts handled with yt-dlp besides Instagram and TikTok. */
const OTHER_VIDEO_HOSTS = [
  'facebook.com', 'fb.watch', 'fb.com', 'x.com', 'twitter.com', 'vimeo.com', 'pinterest.com', 'pin.it',
  'reddit.com', 'v.redd.it', 'threads.net', 'snapchat.com', 'kwai.com', 'dailymotion.com', 'twitch.tv',
];

function bareHost(u: URL): string {
  return u.hostname.toLowerCase().replace(/^(?:www|m|mobile|music)\./, '');
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Parses an http(s) URL; accepts "www.example.com/x" without a scheme. Null for anything else. */
export function parseHttpUrl(input: string): URL | null {
  let s = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$)/i.test(s)) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

/** The first link in shared text ("Mira esta receta https://… 😋"), without trailing punctuation. */
export function extractFirstUrl(text: string): string | null {
  const m = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'`]*/i.exec(text);
  if (!m) return null;
  let url = m[0];
  for (;;) {
    const trimmed = url.replace(/[.,;:!?¡¿'"»”’…]+$/u, '');
    // a closing bracket belongs to the URL only when it also opens one
    const closing = /[)\]}]$/.exec(trimmed);
    if (closing) {
      const open = { ')': '(', ']': '[', '}': '{' }[closing[0]]!;
      if (!trimmed.includes(open)) {
        url = trimmed.slice(0, -1);
        continue;
      }
    }
    url = trimmed;
    break;
  }
  return parseHttpUrl(url) ? url : null;
}

/** 11-character video id from watch, shorts, embed, live and youtu.be links. */
export function youtubeVideoId(url: string | URL): string | null {
  const u = typeof url === 'string' ? parseHttpUrl(url) : url;
  if (!u) return null;
  const host = bareHost(u);
  const segments = u.pathname.split('/').filter((s) => s.length > 0);
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = segments[0] ?? null;
  } else if (hostIs(host, 'youtube.com') || hostIs(host, 'youtube-nocookie.com')) {
    if (segments[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v', 'e'].includes(segments[0] ?? '')) id = segments[1] ?? null;
  }
  return id !== null && YOUTUBE_ID.test(id) ? id : null;
}

export function detectPlatform(url: string): UrlPlatform {
  const u = parseHttpUrl(url);
  if (!u) return 'web';
  const host = bareHost(u);
  if (hostIs(host, 'youtube.com') || host === 'youtu.be' || hostIs(host, 'youtube-nocookie.com')) return 'youtube';
  if (hostIs(host, 'instagram.com') || host === 'instagr.am' || host === 'ig.me') return 'instagram';
  if (hostIs(host, 'tiktok.com')) return 'tiktok';
  if (OTHER_VIDEO_HOSTS.some((d) => hostIs(host, d))) return 'other';
  return 'web';
}

/**
 * Canonical form used for fetching and stored as recipes.source_url:
 * YouTube → https://www.youtube.com/watch?v=ID; Instagram/TikTok without query; websites without
 * tracking parameters (utm_*, fbclid, si, feature, igsh…) or #fragment.
 */
export function normalizeUrl(input: string): string {
  const u = parseHttpUrl(input);
  if (!u) return input.trim();
  const platform = detectPlatform(u.toString());

  if (platform === 'youtube') {
    const id = youtubeVideoId(u);
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }

  u.hash = '';
  if (platform === 'instagram') {
    u.hostname = 'www.instagram.com';
    u.search = '';
    // /reels/CODE and /<user>/reel/CODE → /reel/CODE/
    const m = /\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
    if (m) u.pathname = `/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`;
    return u.toString();
  }
  if (platform === 'tiktok') {
    if (u.hostname === 'tiktok.com' || u.hostname === 'm.tiktok.com') u.hostname = 'www.tiktok.com';
    u.search = '';
    return u.toString();
  }

  for (const key of [...u.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (k.startsWith('utm_') || TRACKING_PARAMS.has(k)) u.searchParams.delete(key);
  }
  let out = u.toString();
  if (out.endsWith('?')) out = out.slice(0, -1);
  return out;
}
