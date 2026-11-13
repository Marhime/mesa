// YouTube links that are a list of videos — a channel in any of its forms, or a playlist — rather than
// one video. They are opened as a creator ("More from …"), never imported as a recipe.
import { parseHttpUrl, youtubeVideoId } from './url';

export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const MAX_NAME = 100;

export type ChannelRef =
  /** /channel/UC… */
  | { kind: 'channel'; id: string }
  /** /@handle */
  | { kind: 'handle'; handle: string }
  /** /c/name (old custom URL) */
  | { kind: 'custom'; name: string }
  /** /user/name (old username URL) */
  | { kind: 'user'; name: string }
  /** /playlist?list=… */
  | { kind: 'playlist'; id: string };

const YOUTUBE_HOST = /(?:^|\.)youtube\.com$/i;

function segment(raw: string | undefined): string | null {
  if (!raw) return null;
  let s: string;
  try {
    s = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  return s !== '' && s.length <= MAX_NAME && !/[\s/?#]/.test(s) ? s : null;
}

/** The channel or playlist a YouTube link points at; null for a video, another site or anything else. */
export function parseChannelUrl(input: string): ChannelRef | null {
  const u = parseHttpUrl(input);
  if (!u || !YOUTUBE_HOST.test(u.hostname) || youtubeVideoId(u)) return null;
  const [first, second] = u.pathname.split('/').filter((s) => s.length > 0);
  const list = u.searchParams.get('list');
  if ((first === 'playlist' || first === 'watch') && list && PLAYLIST_ID.test(list)) return { kind: 'playlist', id: list };
  if (first?.startsWith('@')) {
    const handle = segment(first.slice(1));
    return handle ? { kind: 'handle', handle } : null;
  }
  const name = segment(second);
  if (!name) return null;
  if (first === 'channel') return CHANNEL_ID.test(name) ? { kind: 'channel', id: name } : null;
  if (first === 'c') return { kind: 'custom', name };
  if (first === 'user') return { kind: 'user', name };
  return null;
}

export const channelUrlFromId = (id: string): string => `https://www.youtube.com/channel/${id}`;

/** The canonical page of the channel (or playlist). */
export function channelPageUrl(ref: ChannelRef): string {
  switch (ref.kind) {
    case 'channel':
      return channelUrlFromId(ref.id);
    case 'handle':
      return `https://www.youtube.com/@${encodeURIComponent(ref.handle)}`;
    case 'custom':
      return `https://www.youtube.com/c/${encodeURIComponent(ref.name)}`;
    case 'user':
      return `https://www.youtube.com/user/${encodeURIComponent(ref.name)}`;
    case 'playlist':
      return `https://www.youtube.com/playlist?list=${ref.id}`;
  }
}

/** What to list: the channel's Videos tab (newest first, no Shorts, no lives), or the playlist itself. */
export function channelVideosUrl(ref: ChannelRef): string {
  return ref.kind === 'playlist' ? channelPageUrl(ref) : `${channelPageUrl(ref)}/videos`;
}

/** A YouTube channel or playlist link: a list of videos, not a recipe. */
export const isYouTubeListLink = (url: string): boolean => parseChannelUrl(url) !== null;
