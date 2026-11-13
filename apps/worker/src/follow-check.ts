// "New from your creators": once a day, per household, a look at the creators it follows. Each channel's
// latest videos (the same flat listing and filters as "More from …") are kept in creator_videos. The
// first look at a channel is a baseline: everything is stored as already there, without asking the
// model. After that, videos not seen before go through one batched question per channel (recipe? dish?):
// recipes become new (unless the household already saved them), the rest are stored as not recipes so
// they're never asked about again. A channel that fails is skipped; a bot check stops the run.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatorVideo, ImportJob } from '@mesa/shared';

import { CHANNEL_ID, channelVideosUrl, parseChannelUrl, type ChannelRef } from './channel-url';
import { askRecipes, savedUrls, ytDlpChannelSource, type ChannelSource } from './creator';
import { candidateVideos, thumbnailFor, watchUrl } from './creator-videos';
import { errorMessage, isAbortError } from './errors';
import type { Logger } from './log';
import type { PipelineDeps } from './pipeline-common';
import { sleep } from './retry';
import { YtDlpError } from './ytdlp';
import type { FlatVideo } from './ytdlp-channel';

/** Channels looked at per run (the oldest follows first). */
export const MAX_CHANNELS = 10;
const PAUSE_MIN_MS = 1000;
const PAUSE_JITTER_MS = 2000;
/** YouTube asking to prove we're not a bot (or plainly throttling): going on would only make it worse. */
const BLOCKED = /confirm you.?re not a bot|sign in to confirm|http error 429|too many requests/i;

export interface FollowedCreator {
  channel_id: string;
  url: string;
  name: string;
}

/** A creator_videos row as the worker writes it (id and first_seen_at are the database's). */
export type CreatorVideoRow = Omit<CreatorVideo, 'id' | 'first_seen_at'>;

export interface FollowCheckOptions {
  /** Where the videos come from: yt-dlp unless a test gives another. */
  source: Pick<ChannelSource, 'list'>;
  /** The wait between two channels (1–3 s in production). */
  pause: (signal: AbortSignal) => Promise<void>;
}

export type FollowCheckSummary = {
  followed: number;
  checked: number;
  failed: number;
  /** Channels seen for the first time (stored, nothing new). */
  baselines: number;
  /** Videos stored as new. */
  new: number;
  /** Why the run ended before the last channel, if it did. */
  stopped: 'blocked' | null;
};

/** 1 to 3 seconds, to stay gentle with YouTube. */
export const gentlePause = (signal: AbortSignal): Promise<void> => sleep(PAUSE_MIN_MS + Math.random() * PAUSE_JITTER_MS, signal);

export function isBlocked(err: unknown): boolean {
  return err instanceof YtDlpError && (BLOCKED.test(err.stderrTail) || BLOCKED.test(err.message));
}

/** The channel id when it is a real one (stable when the handle changes), else the followed link. */
export function followedRef(f: FollowedCreator): ChannelRef | null {
  if (CHANNEL_ID.test(f.channel_id)) return { kind: 'channel', id: f.channel_id };
  return parseChannelUrl(f.url);
}

/**
 * The rows to store for videos not seen before. `verdicts` is null for a baseline (every video stored as
 * an old recipe); otherwise it holds the recipes (id → dish) and `saved` the household's saved links.
 */
export function followRows(
  householdId: string,
  channelId: string,
  videos: readonly FlatVideo[],
  verdicts: ReadonlyMap<string, string | null> | null,
  saved: ReadonlySet<string>,
): CreatorVideoRow[] {
  return videos.map((v) => {
    const url = watchUrl(v.id);
    const recipe = verdicts === null || verdicts.has(v.id);
    return {
      household_id: householdId,
      channel_id: channelId,
      url,
      title: v.title,
      dish: verdicts?.get(v.id) ?? null,
      views: v.views === null ? null : Math.round(v.views),
      duration_s: v.duration === null ? null : Math.round(v.duration),
      thumbnail: thumbnailFor(v.id),
      is_recipe: recipe,
      is_new: verdicts !== null && recipe && !saved.has(url),
    };
  });
}

async function followedCreators(db: SupabaseClient, householdId: string): Promise<FollowedCreator[]> {
  const { data, error } = await db
    .from('followed_creators')
    .select('channel_id, url, name')
    .eq('household_id', householdId)
    .eq('platform', 'youtube')
    .order('created_at', { ascending: true })
    .limit(MAX_CHANNELS);
  if (error) throw new Error(`followed_creators: ${error.message}`);
  return (data ?? []) as FollowedCreator[];
}

/** The links already kept for this channel. Throws rather than guess: an empty answer means "baseline". */
async function knownUrls(db: SupabaseClient, householdId: string, channelId: string): Promise<Set<string>> {
  const { data, error } = await db.from('creator_videos').select('url').eq('household_id', householdId).eq('channel_id', channelId);
  if (error) throw new Error(`creator_videos: ${error.message}`);
  return new Set(((data ?? []) as { url: string }[]).map((r) => r.url));
}

/** Never touches a row already there (its "new" belongs to the app now). */
async function storeRows(db: SupabaseClient, rows: readonly CreatorVideoRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from('creator_videos').upsert(rows, { onConflict: 'household_id,url', ignoreDuplicates: true });
  if (error) throw new Error(`creator_videos insert: ${error.message}`);
}

interface ChannelOutcome {
  baseline: boolean;
  new: number;
}

/** Looks at one followed channel and stores what it hasn't seen. */
async function checkChannel(
  deps: PipelineDeps,
  householdId: string,
  f: FollowedCreator,
  source: FollowCheckOptions['source'],
  log: Logger,
  signal: AbortSignal,
): Promise<ChannelOutcome> {
  const ref = followedRef(f);
  if (!ref) throw new Error(`not a YouTube channel: ${f.url.slice(0, 200)}`);
  const listing = await source.list(channelVideosUrl(ref), signal);
  const candidates = candidateVideos(listing.videos);
  const known = await knownUrls(deps.db, householdId, f.channel_id);
  const baseline = known.size === 0;
  const unseen = candidates.filter((v) => !known.has(watchUrl(v.id)));

  let rows: CreatorVideoRow[];
  if (baseline) {
    rows = followRows(householdId, f.channel_id, unseen, null, new Set());
  } else {
    // Both skip their query when nothing is unseen.
    const verdicts = await askRecipes(deps, f.name, unseen, signal);
    const saved = await savedUrls(deps.db, householdId, unseen.map((v) => watchUrl(v.id)), log);
    rows = followRows(householdId, f.channel_id, unseen, verdicts, saved);
  }
  await storeRows(deps.db, rows);
  const fresh = rows.filter((r) => r.is_new).length;
  log.info('follow_check_channel', {
    channel: f.channel_id,
    listed: listing.videos.length,
    candidates: candidates.length,
    unseen: unseen.length,
    baseline,
    recipes: rows.filter((r) => r.is_recipe).length,
    new: fresh,
  });
  return { baseline, new: fresh };
}

/** The daily look at a household's followed creators. Throws only when it can't start (or is aborted). */
export async function checkFollows(
  deps: PipelineDeps,
  job: ImportJob,
  log: Logger,
  signal: AbortSignal,
  opts: FollowCheckOptions,
): Promise<FollowCheckSummary> {
  const followed = await followedCreators(deps.db, job.household_id);
  const summary: FollowCheckSummary = { followed: followed.length, checked: 0, failed: 0, baselines: 0, new: 0, stopped: null };
  for (const [i, f] of followed.entries()) {
    if (i > 0) await opts.pause(signal);
    try {
      const outcome = await checkChannel(deps, job.household_id, f, opts.source, log, signal);
      summary.checked += 1;
      if (outcome.baseline) summary.baselines += 1;
      summary.new += outcome.new;
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw err;
      summary.failed += 1;
      log.warn('follow_check_channel_failed', { channel: f.channel_id, err: errorMessage(err) });
      if (isBlocked(err)) {
        summary.stopped = 'blocked';
        break;
      }
    }
  }
  log.info('follow_check_done', { ...summary });
  return summary;
}

export const runFollowCheck = (deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<FollowCheckSummary> =>
  checkFollows(deps, job, log, signal, { source: ytDlpChannelSource(deps.config), pause: gentlePause });
