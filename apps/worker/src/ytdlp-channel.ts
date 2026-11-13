// A YouTube channel's (or playlist's) latest videos, flat: yt-dlp prints one JSON line per video without
// opening each one, so 30 videos take a few seconds.
import { CHANNEL_ID } from './channel-url';
import { commonArgs, runYtDlp, videoLink, YtDlpError, type YtDlpOptions } from './ytdlp';

export interface FlatVideo {
  /** YouTube video id (11 characters). */
  id: string;
  title: string;
  /** A short snippet when the listing has one. */
  description: string | null;
  views: number | null;
  /** Seconds. */
  duration: number | null;
  /** yt-dlp live_status (is_live, is_upcoming, was_live, post_live, not_live), null when not said. */
  liveStatus: string | null;
  /** yt-dlp availability (public, unlisted, subscriber_only…), null when not said. */
  availability: string | null;
  /** Unix seconds when yt-dlp knows it (a flat channel listing usually doesn't). */
  timestamp: number | null;
  /** Listed as a Short (/shorts/ link). */
  short: boolean;
}

export interface ChannelListing {
  /** The channel (a playlist's owner) as the listing names it. */
  name: string | null;
  /** Its UC… id. */
  channelId: string | null;
  /** In the listing's order (a Videos tab is newest first). */
  videos: FlatVideo[];
}

/** How many of the latest videos are listed. */
export const LIST_COUNT = 30;
const LIST_TIMEOUT_MS = 60_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 300;

type Info = Record<string, unknown>;
const isObject = (v: unknown): v is Info => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.replace(/\s+/g, ' ').trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function timestampOf(e: Info): number | null {
  const ts = num(e.timestamp) ?? num(e.release_timestamp);
  if (ts !== null) return ts;
  const m = typeof e.upload_date === 'string' ? /^(\d{4})(\d{2})(\d{2})$/.exec(e.upload_date) : null;
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000 : null;
}

/** One listed video; null for a channel, a playlist, or a private / deleted placeholder. */
export function flatVideo(e: Info): FlatVideo | null {
  const id = str(e.id);
  const title = str(e.title);
  if (!id || !VIDEO_ID.test(id) || !title || /^\[(?:private|deleted) video\]$/i.test(title)) return null;
  if (e.ie_key !== undefined && e.ie_key !== 'Youtube') return null;
  const url = str(e.url) ?? '';
  return {
    id,
    title: title.slice(0, MAX_TITLE),
    description: str(e.description)?.slice(0, MAX_DESCRIPTION) ?? null,
    views: num(e.view_count),
    duration: num(e.duration) || null,
    liveStatus: str(e.live_status),
    availability: str(e.availability),
    timestamp: timestampOf(e),
    short: /\/shorts\//.test(url),
  };
}

const channelIdOf = (...values: unknown[]): string | null => {
  for (const v of values) if (typeof v === 'string' && CHANNEL_ID.test(v)) return v;
  return null;
};

/** Reads `yt-dlp --flat-playlist --dump-json`: one JSON object per line (unreadable lines skipped). */
export function parseFlatPlaylist(stdout: string): ChannelListing {
  let name: string | null = null;
  let channelId: string | null = null;
  const videos: FlatVideo[] = [];
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(e)) continue;
    // A playlist's owner first: its videos may come from other channels.
    name ??= str(e.playlist_channel) ?? str(e.playlist_uploader) ?? str(e.channel) ?? str(e.uploader);
    channelId ??= channelIdOf(e.playlist_channel_id, e.playlist_id, e.channel_id);
    const video = flatVideo(e);
    if (video) videos.push(video);
  }
  return { name, channelId, videos };
}

/** The latest videos of a channel's Videos tab or of a playlist (see channelVideosUrl). */
export async function listChannelVideos(
  opts: YtDlpOptions,
  url: string,
  workDir: string,
  signal?: AbortSignal,
  count = LIST_COUNT,
): Promise<ChannelListing> {
  const args = [...(await commonArgs(opts, workDir)), '--flat-playlist', '--playlist-end', String(count), '--dump-json', '--', videoLink(url)];
  try {
    const { stdout } = await runYtDlp(opts.path, args, LIST_TIMEOUT_MS, signal);
    return parseFlatPlaylist(stdout);
  } catch (err) {
    // A channel with only Shorts or lives has no Videos tab: nothing to show, not a failure.
    if (err instanceof YtDlpError && /does not have a videos tab/i.test(err.stderrTail)) return { name: null, channelId: null, videos: [] };
    throw err;
  }
}
