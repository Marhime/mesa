// YouTube through yt-dlp for "For you" and "Find me": a flat search (`ytsearch8:`, one JSON line per
// video, without opening any) and one video's full metadata (views, likes, channel size, upload date,
// the start of its description), which is what tells a loved recipe from a forgotten one.
import { CHANNEL_ID } from './channel-url';
import { commonArgs, runYtDlp, videoLink, YtDlpError, type YtDlpOptions } from './ytdlp';
import { flatVideo, timestampOf, type FlatVideo } from './ytdlp-channel';

/** One search result: a flat video and the channel that posted it. */
export interface SearchHit extends FlatVideo {
  channel: string | null;
  /** UC… when the result says it. */
  channelId: string | null;
}

/** What one video's page says about it. */
export interface VideoDetails {
  id: string;
  title: string | null;
  /** The start of the description, whitespace collapsed. */
  description: string | null;
  /** Seconds. */
  duration: number | null;
  views: number | null;
  likes: number | null;
  /** The channel's subscribers. */
  followers: number | null;
  /** Unix seconds of the upload. */
  uploadedAt: number | null;
  channel: string | null;
  channelId: string | null;
  /** ISO 639-1 of the video when the uploader set it. */
  language: string | null;
  liveStatus: string | null;
  availability: string | null;
  /** A Short (vertical clip of a few minutes at most). */
  short: boolean;
}

export const SEARCH_RESULTS = 8;
const SEARCH_TIMEOUT_MS = 45_000;
const DETAILS_TIMEOUT_MS = 45_000;
const MAX_DESCRIPTION = 400;
const SHORT_MAX_SECONDS = 180;
const MAX_QUERY = 100;

type Info = Record<string, unknown>;
const isObject = (v: unknown): v is Info => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.replace(/\s+/g, ' ').trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const channelIdOf = (v: unknown): string | null => (typeof v === 'string' && CHANNEL_ID.test(v) ? v : null);

/** "es-419", "en_US", "FR" → "es", "en", "fr"; anything else → null. */
export function isoLanguage(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^([a-z]{2})(?:[-_][a-z0-9]+)*$/i.exec(v.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** Reads `yt-dlp --flat-playlist --dump-json "ytsearchN:…"`: one JSON object per line (others skipped). */
export function parseSearchResults(stdout: string): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(e)) continue;
    const video = flatVideo(e);
    if (!video) continue;
    hits.push({ ...video, channel: str(e.channel) ?? str(e.uploader), channelId: channelIdOf(e.channel_id) });
  }
  return hits;
}

function isShort(e: Info, duration: number | null): boolean {
  if (e.media_type === 'short') return true;
  if (/\/shorts\//.test(`${str(e.webpage_url) ?? ''} ${str(e.original_url) ?? ''}`)) return true;
  const w = num(e.width);
  const h = num(e.height);
  return w !== null && h !== null && h > w && duration !== null && duration <= SHORT_MAX_SECONDS;
}

/** Reads `yt-dlp --dump-single-json` for one YouTube video. */
export function parseVideoDetails(json: unknown): VideoDetails {
  if (!isObject(json) || !str(json.id)) throw new YtDlpError('', 'yt-dlp returned no video metadata');
  const duration = num(json.duration) || null;
  const liveStatus = str(json.live_status) ?? (json.was_live === true ? 'was_live' : json.is_live === true ? 'is_live' : null);
  return {
    id: str(json.id)!,
    title: str(json.title),
    description: str(json.description)?.slice(0, MAX_DESCRIPTION) ?? null,
    duration,
    views: num(json.view_count),
    likes: num(json.like_count),
    followers: num(json.channel_follower_count),
    uploadedAt: timestampOf(json),
    channel: str(json.channel) ?? str(json.uploader),
    channelId: channelIdOf(json.channel_id),
    language: isoLanguage(json.language),
    liveStatus,
    availability: str(json.availability),
    short: isShort(json, duration),
  };
}

/** The first `count` YouTube results for a query, flat. */
export async function searchVideos(
  opts: YtDlpOptions,
  query: string,
  workDir: string,
  signal?: AbortSignal,
  count = SEARCH_RESULTS,
): Promise<SearchHit[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
  if (q === '') return [];
  const args = [...(await commonArgs(opts, workDir)), '--flat-playlist', '--dump-json', '--', `ytsearch${count}:${q}`];
  const { stdout } = await runYtDlp(opts.path, args, SEARCH_TIMEOUT_MS, signal);
  return parseSearchResults(stdout);
}

/** One video's metadata, without downloading it. */
export async function fetchVideoDetails(opts: YtDlpOptions, url: string, workDir: string, signal?: AbortSignal): Promise<VideoDetails> {
  const link = videoLink(url);
  const args = [
    ...(await commonArgs(opts, workDir)),
    '--dump-single-json',
    '--skip-download',
    '--no-playlist',
    '--ignore-no-formats-error',
    '--',
    link,
  ];
  const { stdout } = await runYtDlp(opts.path, args, DETAILS_TIMEOUT_MS, signal);
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new YtDlpError('', 'yt-dlp printed invalid JSON');
  }
  return parseVideoDetails(json);
}
