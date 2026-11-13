// Who made a recipe ("Food is Love"): from yt-dlp's metadata for videos and posts, from the page for
// websites. Always best effort: an unknown author is null, never a failed import.
import { CHANNEL_ID, channelPageUrl, channelUrlFromId, parseChannelUrl } from './channel-url';

export interface SourceAuthor {
  name: string;
  /** The creator's channel page (YouTube only), for "More from …". */
  channelUrl: string | null;
  /** YouTube channel id (UC…), or the account id yt-dlp gives for Instagram / TikTok. */
  channelId: string | null;
}

const MAX_NAME = 120;
const MAX_ID = 100;

type Info = Record<string, unknown>;

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};

/** "By Jane Doe" → "Jane Doe"; links and over-long strings are not names. */
export function cleanAuthorName(v: unknown): string | null {
  const s = text(v)?.replace(/^(?:by|par|por)\s*:?\s+/i, '').trim();
  if (!s || /^https?:\/\//i.test(s) || s.length > MAX_NAME) return null;
  return s;
}

const firstName = (values: unknown[]): string | null => {
  for (const v of values) {
    const name = cleanAuthorName(v);
    if (name) return name;
  }
  return null;
};

/** A YouTube channel page from yt-dlp's channel_url / uploader_url, canonical when possible. */
function youtubeChannelPage(...urls: unknown[]): string | null {
  for (const u of urls) {
    const ref = typeof u === 'string' ? parseChannelUrl(u) : null;
    if (ref && ref.kind !== 'playlist') return channelPageUrl(ref);
  }
  return null;
}

/**
 * The creator from `yt-dlp --dump-single-json` (`fallback`: the first entry of a carousel, for fields the
 * post itself lacks). YouTube: channel name, id and page. Instagram: full name (uploader), else the
 * username (channel). TikTok and others: display name (channel), else the handle (uploader).
 */
export function authorFromYtDlp(info: Info, fallback?: Info): SourceAuthor | null {
  const field = (key: string): unknown => info[key] ?? fallback?.[key];
  const extractor = String(field('extractor_key') ?? field('extractor') ?? '').toLowerCase();

  if (extractor.startsWith('youtube')) {
    const handle = typeof field('uploader_id') === 'string' && String(field('uploader_id')).startsWith('@') ? field('uploader_id') : null;
    const name = firstName([field('channel'), field('uploader'), handle]);
    if (!name) return null;
    const rawId = text(field('channel_id'));
    const channelId = rawId && CHANNEL_ID.test(rawId) ? rawId : null;
    const channelUrl = channelId ? channelUrlFromId(channelId) : youtubeChannelPage(field('channel_url'), field('uploader_url'));
    return { name, channelUrl, channelId };
  }

  const names = extractor.startsWith('instagram') ? [field('uploader'), field('channel')] : [field('channel'), field('uploader'), field('creator')];
  const name = firstName(names);
  if (!name) return null;
  const id = text(field('uploader_id')) ?? text(field('channel_id'));
  return { name, channelUrl: null, channelId: id && id.length <= MAX_ID ? id : null };
}

/** A website: the recipe's author (JSON-LD), else the site's name. */
export function webAuthor(page: { recipe: { author: string | null } | null; siteName: string | null }): SourceAuthor | null {
  const name = cleanAuthorName(page.recipe?.author) ?? cleanAuthorName(page.siteName);
  return name ? { name, channelUrl: null, channelId: null } : null;
}

/** The recipes columns for a known author; nothing when unknown (the import never depends on it). */
export function authorColumns(author: SourceAuthor | null | undefined): Record<string, string | null> {
  if (!author) return {};
  return { source_author: author.name, source_channel_url: author.channelUrl, source_channel_id: author.channelId };
}
