// Where "For you" and "Find me" look for videos (yt-dlp in production, a fake in tests), and how gently:
// a fixed number of calls per run, a 1–3 s pause between two, and no call at all once YouTube asks to
// prove we're not a bot (what was found until then is kept).
import type { Config } from './config';
import { channelVideosUrl } from './channel-url';
import { errorMessage, isAbortError } from './errors';
import { gentlePause, isBlocked } from './follow-check';
import type { Logger } from './log';
import { withWorkDir, ytOptions } from './pipeline-common';
import { listChannelVideos, type ChannelListing } from './ytdlp-channel';
import { fetchVideoDetails, searchVideos, type SearchHit, type VideoDetails } from './youtube-search';

/** Recent uploads looked at per creator. */
const UPLOADS = 10;

export interface VideoSource {
  /** A YouTube search, flat (a few results). */
  search(query: string, signal: AbortSignal): Promise<SearchHit[]>;
  /** One video's metadata (views, likes, channel size…). */
  details(url: string, signal: AbortSignal): Promise<VideoDetails>;
  /** A channel's latest uploads, flat. */
  uploads(channelId: string, signal: AbortSignal): Promise<ChannelListing>;
}

/** What a run needs from the outside world. */
export interface DiscoverIO {
  source: VideoSource;
  /** The wait between two calls. */
  pause: (signal: AbortSignal) => Promise<void>;
}

export function ytDlpVideoSource(config: Config): VideoSource {
  const opts = ytOptions(config);
  return {
    search: (query, signal) => withWorkDir((dir) => searchVideos(opts, query, dir, signal)),
    details: (url, signal) => withWorkDir((dir) => fetchVideoDetails(opts, url, dir, signal)),
    uploads: (channelId, signal) => withWorkDir((dir) => listChannelVideos(opts, channelVideosUrl({ kind: 'channel', id: channelId }), dir, signal, UPLOADS)),
  };
}

export const ytDlpDiscoverIO = (config: Config): DiscoverIO => ({ source: ytDlpVideoSource(config), pause: gentlePause });

/** The calls of one run: counted, spaced out, and stopped for good by a bot check. */
export class PacedCalls {
  private made = 0;
  private failures = 0;
  private stopped = false;

  constructor(
    private readonly pause: DiscoverIO['pause'],
    private readonly max: number,
    private readonly log: Logger,
  ) {}

  get calls(): number {
    return this.made;
  }

  get failed(): number {
    return this.failures;
  }

  /** YouTube asked for a bot check (or throttled): no more calls this run. */
  get blocked(): boolean {
    return this.stopped;
  }

  /** Calls this run may still make. */
  get left(): number {
    return this.stopped ? 0 : Math.max(0, this.max - this.made);
  }

  get canCall(): boolean {
    return this.left > 0;
  }

  /** The call's answer; null when no call may be made or it failed (logged). Aborts are rethrown. */
  async run<T>(what: string, fn: () => Promise<T>, signal: AbortSignal): Promise<T | null> {
    if (!this.canCall) return null;
    if (this.made > 0) await this.pause(signal);
    this.made += 1;
    try {
      return await fn();
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw err;
      this.failures += 1;
      if (isBlocked(err)) this.stopped = true;
      this.log.warn('discover_call_failed', { what, blocked: this.stopped, err: errorMessage(err) });
      return null;
    }
  }
}
