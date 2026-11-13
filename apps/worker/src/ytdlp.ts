// yt-dlp: metadata (caption, title, thumbnail, duration) and a small mp4 for Instagram, TikTok and others.
import { spawn } from 'node:child_process';
import { copyFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { authorFromYtDlp, type SourceAuthor } from './author';
import { ImportError, type ErrorCode } from './errors';
import { detectPlatform, parseHttpUrl } from './url';

export interface YtDlpOptions {
  path: string;
  cookies: string | null;
}

export interface VideoMeta {
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  /** Seconds. */
  duration: number | null;
  hasVideo: boolean;
  /** 1-based playlist position of the first video in a carousel; null for a single video. */
  videoIndex: number | null;
  /** Images of a post without video (Instagram carousel, Pinterest pin…), best size first. */
  imageUrls: string[];
  /** Who posted it (channel, uploader), when yt-dlp says. */
  author: SourceAuthor | null;
}

const MAX_VIDEO_SECONDS = 180;
const MAX_IMAGES = 10;
const META_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 240_000;

type Info = Record<string, unknown>;
const isObject = (v: unknown): v is Info => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

function entryHasVideo(e: Info): boolean {
  const formats = Array.isArray(e.formats) ? e.formats.filter(isObject) : [];
  if (formats.some((f) => typeof f.vcodec === 'string' && f.vcodec !== 'none')) return true;
  if (formats.some((f) => f.vcodec === undefined && /^(?:mp4|webm|mov|m4v)$/.test(String(f.ext ?? '')))) return true;
  return typeof e.vcodec === 'string' && e.vcodec !== 'none';
}

function bestThumbnail(e: Info): string | null {
  const direct = str(e.thumbnail);
  if (direct) return direct;
  const thumbs = Array.isArray(e.thumbnails) ? e.thumbnails.filter(isObject) : [];
  // yt-dlp orders thumbnails worst → best
  for (let i = thumbs.length - 1; i >= 0; i--) {
    const u = str(thumbs[i]!.url);
    if (u) return u;
  }
  return null;
}

/** Reads the JSON from `yt-dlp --dump-single-json` (a single video or a playlist/carousel). */
export function parseYtDlpInfo(json: unknown): VideoMeta {
  if (!isObject(json)) throw new Error('yt-dlp returned no metadata');
  const entries = Array.isArray(json.entries) ? json.entries.filter(isObject) : [];
  const first = entries[0];
  const description = str(json.description) ?? (first ? str(first.description) : null);
  const title = str(json.title) ?? (first ? str(first.title) : null);
  const duration = (e: Info | undefined): number | null => (e && typeof e.duration === 'number' && e.duration > 0 ? e.duration : null);

  if (entries.length > 0) {
    const videoPos = entries.findIndex(entryHasVideo);
    const images = entries.filter((e) => !entryHasVideo(e)).map(bestThumbnail).filter((u): u is string => u !== null);
    const videoEntry = videoPos >= 0 ? entries[videoPos] : undefined;
    return {
      title,
      description,
      thumbnail: str(json.thumbnail) ?? (videoEntry ? bestThumbnail(videoEntry) : null) ?? bestThumbnail(first!),
      duration: duration(videoEntry),
      hasVideo: videoPos >= 0,
      videoIndex: videoPos >= 0 ? videoPos + 1 : null,
      imageUrls: [...new Set(images)].slice(0, MAX_IMAGES),
      author: authorFromYtDlp(json, first),
    };
  }
  const hasVideo = entryHasVideo(json);
  const thumb = bestThumbnail(json);
  return {
    title,
    description,
    thumbnail: thumb,
    duration: duration(json),
    hasVideo,
    videoIndex: null,
    imageUrls: !hasVideo && thumb ? [thumb] : [],
    author: authorFromYtDlp(json),
  };
}

/** Why yt-dlp failed, for the person, from its stderr. */
export function ytDlpErrorCode(stderr: string): ErrorCode {
  const s = stderr.toLowerCase();
  if (/unsupported url/.test(s)) return 'unsupportedLink';
  if (/private|login|log in|logged-in|sign in|cookies|rate-limit|rate limit|not available, rate|confirm you.?re not a bot|age-restricted|inappropriate/.test(s)) {
    return 'videoPrivate';
  }
  if (/http error 404|not found|has been removed|deleted|no longer available|video unavailable|does not exist/.test(s)) {
    return 'videoUnavailable';
  }
  return 'videoFailed';
}

export class YtDlpError extends ImportError {
  constructor(
    readonly stderrTail: string,
    detail: string,
  ) {
    super(ytDlpErrorCode(stderrTail), { detail });
    this.name = 'YtDlpError';
  }
}

interface RunResult {
  stdout: string;
  stderr: string;
}

export function runYtDlp(bin: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
    const out: Buffer[] = [];
    let outBytes = 0;
    let err = '';
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const kill = (): void => {
      if (child.exitCode === null) child.kill('SIGKILL');
    };
    const timer = setTimeout(() => {
      kill();
      finish(() => reject(new YtDlpError(err.slice(-4000), `timed out after ${timeoutMs} ms`)));
    }, timeoutMs);
    const onAbort = (): void => {
      kill();
      finish(() => reject(signal!.reason as Error));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > 50 * 1024 * 1024) {
        kill();
        return;
      }
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err = (err + chunk.toString('utf8')).slice(-16_000);
    });
    child.on('error', (e: NodeJS.ErrnoException) => {
      finish(() =>
        reject(e.code === 'ENOENT' ? new YtDlpError('', `yt-dlp not found at "${bin}"`) : new YtDlpError(err, e.message)),
      );
    });
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: err });
        else reject(new YtDlpError(err.slice(-4000), `exit code ${code ?? 'signal'}`));
      });
    });
  });
}

/**
 * The link yt-dlp is given: a video host's (url.ts) over http(s) on its default port, never a website, an
 * address or a file. yt-dlp opens whatever it is handed, so every function here that gives it a link
 * checks it first (callers already only pass video links: this is the last line).
 */
export function videoLink(url: string): string {
  const u = /^https?:\/\//i.test(url) ? parseHttpUrl(url) : null;
  if (!u || u.port !== '' || u.username !== '' || u.password !== '' || detectPlatform(url) === 'web') {
    throw new ImportError('unsupportedLink', { detail: `not a video link: ${url.slice(0, 200)}` });
  }
  return url;
}

/**
 * yt-dlp saves cookies back into the file it was given; a private copy per run keeps the
 * mounted file read-only and avoids two jobs writing it at once.
 */
export async function commonArgs(opts: YtDlpOptions, workDir: string): Promise<string[]> {
  const args = ['--ignore-config', '--no-progress', '--no-cache-dir', '--socket-timeout', '20', '--retries', '2', '--extractor-retries', '1'];
  if (opts.cookies) {
    const copy = join(workDir, 'cookies.txt');
    await copyFile(opts.cookies, copy);
    args.push('--cookies', copy);
  }
  return args;
}

export async function fetchVideoMeta(opts: YtDlpOptions, url: string, workDir: string, signal?: AbortSignal, timeoutMs = META_TIMEOUT_MS): Promise<VideoMeta> {
  const link = videoLink(url);
  const args = [
    ...(await commonArgs(opts, workDir)),
    '--dump-single-json',
    '--skip-download',
    '--ignore-no-formats-error',
    '--playlist-end',
    String(MAX_IMAGES),
    '--',
    link,
  ];
  const { stdout } = await runYtDlp(opts.path, args, timeoutMs, signal);
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new YtDlpError('', 'yt-dlp printed invalid JSON');
  }
  return parseYtDlpInfo(json);
}

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/mov', '3gp': 'video/3gpp', mpg: 'video/mpg',
  mpeg: 'video/mpeg', avi: 'video/avi', flv: 'video/x-flv', wmv: 'video/wmv',
};

/** Downloads at most the first 3 minutes at ≤720p into workDir. Returns the file and its MIME type. */
export async function downloadVideo(
  opts: YtDlpOptions,
  url: string,
  meta: VideoMeta,
  workDir: string,
  signal?: AbortSignal,
): Promise<{ path: string; mimeType: string; bytes: number }> {
  const link = videoLink(url);
  const args = [
    ...(await commonArgs(opts, workDir)),
    '-f',
    'mp4[height<=720]/best[height<=720]/best',
    '-S',
    'vcodec:h264',
    '--merge-output-format',
    'mp4',
    '--max-filesize',
    '200M',
    '--no-part',
    '--no-mtime',
    '-o',
    join(workDir, 'video.%(ext)s'),
  ];
  if (meta.videoIndex !== null) args.push('--playlist-items', String(meta.videoIndex));
  else args.push('--no-playlist');
  if (meta.duration !== null && meta.duration > MAX_VIDEO_SECONDS) args.push('--download-sections', `*0-${MAX_VIDEO_SECONDS}`);
  args.push('--', link);
  await runYtDlp(opts.path, args, DOWNLOAD_TIMEOUT_MS, signal);

  const files = (await readdir(workDir)).filter((f) => f.startsWith('video.') && !/\.(?:part|ytdl|temp)$/.test(f));
  for (const f of files) {
    const path = join(workDir, f);
    const info = await stat(path);
    if (info.size > 0) {
      const ext = f.split('.').pop()!.toLowerCase();
      return { path, mimeType: VIDEO_MIME[ext] ?? 'video/mp4', bytes: info.size };
    }
  }
  throw new YtDlpError('', 'yt-dlp finished without a video file (too large or no video)');
}

export async function ytDlpVersion(opts: YtDlpOptions): Promise<string | null> {
  try {
    const { stdout } = await runYtDlp(opts.path, ['--version'], 15_000);
    return stdout.trim();
  } catch {
    return null;
  }
}
