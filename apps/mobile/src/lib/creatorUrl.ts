// YouTube channel and playlist links: they open a creator's latest recipes instead of a recipe import. Pure.

const HOST = String.raw`^https?:\/\/(?:www\.|m\.)?youtube\.com\/`;
/** youtube.com/@handle, /channel/UC…, /c/name, /user/name, optionally on one of the channel's tabs. */
const CHANNEL = new RegExp(
  HOST + String.raw`(@[^/?#\s]+|channel\/[\w-]+|c\/[^/?#\s]+|user\/[^/?#\s]+)(?:\/(?:videos|featured|shorts|streams|playlists|home))?\/?(?:[?#]\S*)?$`,
  'i',
);
const PLAYLIST = new RegExp(HOST + String.raw`playlist\?(?:\S*&)?list=([\w-]+)`, 'i');

/**
 * The channel or playlist a text links to, normalized ("https://www.youtube.com/@foodislove");
 * null for a video (watch, youtu.be, Shorts) or anything else.
 */
export function creatorLinkOf(text: string): string | null {
  const t = text.trim();
  if (t.length === 0 || /\s/.test(t)) return null;
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const channel = CHANNEL.exec(url);
  if (channel) return `https://www.youtube.com/${channel[1]}`;
  const playlist = PLAYLIST.exec(url);
  if (playlist) return `https://www.youtube.com/playlist?list=${playlist[1]}`;
  return null;
}

/** "@foodislove" from a handle link, to name the creator before their videos are listed; null otherwise. */
export function handleOf(url: string): string | null {
  const m = /youtube\.com\/(@[^/?#\s]+)/i.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return m[1]!;
  }
}
