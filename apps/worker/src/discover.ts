// "For you" (weekly, in the background: 5 real recipe videos in `suggestions`) and "Find me" (asked:
// 3 to 5 videos for a wish, in import_jobs.result). One pipeline for both:
//   taste (SQL) → searches (1 model call) → candidates (yt-dlp searches; for the weekly look also the new
//   videos of followed creators and the uploads of creators the household cooks from) → cheap filters →
//   the most promising pages opened → one batched verdict (1 model call: real recipe? dish, cuisine,
//   language, fit, why) → ranking with diversity.
// At most 2 model calls and MAX_CALLS yt-dlp calls per run, 1–3 s apart; a bot check stops the yt-dlp
// calls and the run goes on with what it has.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FoundVideos, ImportJob } from '@mesa/shared';

import { fromFollowedVideo, fromSearchHit, fromUploads, withDetails, type Candidate, type FollowedVideoRow } from './discover-candidates';
import { excludedLinks, filterCandidates, type DiscoverKind, type Rejection } from './discover-filter';
import { judgeRequest, normalizeVerdicts, type Verdict } from './discover-judge';
import { foundVideos, storeSuggestions, suggestionRows } from './discover-output';
import { loadTaste, type Taste } from './discover-profile';
import { cleanWish, findQueries, findQueriesRequest, FOR_YOU_QUERIES, forYouQueriesRequest, normalizeQueries, type SearchQuery } from './discover-queries';
import { creatorTrust, diversify, preselect, rankVideos, type Ranked, type Trust } from './discover-rank';
import { PacedCalls, ytDlpDiscoverIO, type DiscoverIO } from './discover-source';
import { ImportError, MESSAGES } from './errors';
import type { Logger } from './log';
import type { PipelineDeps } from './pipeline-common';
import { youtubeVideoId } from './url';

/** yt-dlp calls per run, everything included. */
export const MAX_CALLS = 25;
export const FOR_YOU_COUNT = 5;
export const FIND_COUNT = 5;
/** Pages opened per run: the weekly look takes its time; someone is waiting for Find me. */
export const VERIFY: Record<DiscoverKind, number> = { for_you: 15, find: 10 };
/** New videos of followed creators considered (they're already known to be recipes). */
const MAX_FOLLOWED_VIDEOS = 4;
const FOLLOWED_LOOKBACK = 40;
/** Creators of cooked recipes whose uploads are listed, when calls are left for opening pages after. */
const MAX_COOKED_CREATORS = 2;
/** Videos in the one batched verdict. */
const MAX_JUDGED = 20;
/** Fit floors (0–1): Find me must match the wish (3/5); For you only drops what doesn't fit at all. */
const MIN_FIT: Record<DiscoverKind, number> = { for_you: 0.25, find: 0.5 };

export interface DiscoverOptions extends DiscoverIO {
  now: () => number;
}

/** One run's context. */
interface Run {
  deps: PipelineDeps;
  job: ImportJob;
  log: Logger;
  signal: AbortSignal;
  opts: DiscoverOptions;
  taste: Taste;
  trust: Trust;
  calls: PacedCalls;
  today: Date;
}

function newRun(deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal, opts: DiscoverOptions, taste: Taste, today: Date): Run {
  return { deps, job, log, signal, opts, taste, trust: creatorTrust(taste.creators), calls: new PacedCalls(opts.pause, MAX_CALLS, log), today };
}

async function searchAll(run: Run, queries: readonly SearchQuery[]): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (const query of queries) {
    const hits = await run.calls.run('search', () => run.opts.source.search(query.q, run.signal), run.signal);
    if (hits) found.push(...hits.map((h) => fromSearchHit(h, query.q)));
  }
  return found;
}

/** The latest recipe videos the daily look found for followed creators, not saved or suggested yet. */
async function followedVideos(run: Run, excluded: ReadonlySet<string>): Promise<Candidate[]> {
  if (run.taste.followed.length === 0) return [];
  const names = new Map(run.taste.followed.map((f) => [f.channelId, f.name]));
  const db: SupabaseClient = run.deps.db;
  const { data, error } = await db
    .from('creator_videos')
    .select('url, title, dish, views, duration_s, channel_id')
    .eq('household_id', run.job.household_id)
    .eq('is_recipe', true)
    .order('first_seen_at', { ascending: false })
    .limit(FOLLOWED_LOOKBACK);
  if (error) {
    run.log.warn('for_you_followed_failed', { err: error.message });
    return [];
  }
  const videos = ((data ?? []) as FollowedVideoRow[]).flatMap((row) => {
    const name = names.get(row.channel_id);
    const c = name ? fromFollowedVideo(row, name, youtubeVideoId(row.url)) : null;
    return c ? [c] : [];
  });
  return filterCandidates(videos, excluded, false).kept.slice(0, MAX_FOLLOWED_VIDEOS);
}

/** Recent uploads of the creators the household cooks from, only while enough calls are left after. */
async function cookedCreatorUploads(run: Run): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (const creator of run.taste.cookedCreators.slice(0, MAX_COOKED_CREATORS)) {
    if (run.calls.left <= VERIFY.for_you) break;
    const listing = await run.calls.run('uploads', () => run.opts.source.uploads(creator.channelId, run.signal), run.signal);
    if (listing) found.push(...fromUploads(listing, creator));
  }
  return found;
}

/**
 * Opens each chosen video's page. A video that fails to open is dropped (gone, private); once no call
 * may be made (bot check, no calls left), the rest keep what their listing said.
 */
async function verify(run: Run, chosen: readonly Candidate[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const c of chosen) {
    if (!run.calls.canCall) {
      out.push(c);
      continue;
    }
    const details = await run.calls.run('details', () => run.opts.source.details(c.url, run.signal), run.signal);
    if (details?.id === c.id) out.push(withDetails(c, details));
    else if (!details && run.calls.blocked) out.push(c);
  }
  return out;
}

/** One model call for all of them; no call when there is nothing to judge. */
async function judge(run: Run, candidates: readonly Candidate[], wish: string | null): Promise<Map<string, Verdict>> {
  if (candidates.length === 0) return new Map();
  const raw = await run.deps.ai.askJson(judgeRequest(run.taste.profile, candidates, wish, run.today), 'discover_judge', run.signal);
  const verdicts = normalizeVerdicts(raw, new Set(candidates.map((c) => c.id)));
  if (!verdicts) throw new ImportError('aiFailed', { detail: 'unreadable verdicts' });
  return verdicts;
}

export type DiscoverCounts = {
  found: number;
  kept: number;
  verified: number;
  judged: number;
  recipes: number;
  chosen: number;
  ytdlp_calls: number;
  ytdlp_failed: number;
  stopped: 'blocked' | null;
  dropped: Partial<Record<Rejection, number>>;
};

/** From the candidates found to the best `max`, the same way for both kinds. */
async function choose(run: Run, pool: readonly Candidate[], kind: DiscoverKind, wish: string | null, max: number): Promise<{ ranked: Ranked[]; counts: DiscoverCounts }> {
  const excluded = excludedLinks(run.taste.known, kind);
  const cheap = filterCandidates(pool, excluded, false);
  const checked = await verify(run, preselect(cheap.kept, VERIFY[kind], run.trust));
  const final = filterCandidates(checked, excluded, true);
  const judged = final.kept.slice(0, MAX_JUDGED);
  const verdicts = await judge(run, judged, wish);
  const ranked = diversify(rankVideos(judged, verdicts, run.trust, run.opts.now(), MIN_FIT[kind]), max);
  const dropped: DiscoverCounts['dropped'] = { ...cheap.dropped };
  for (const [why, n] of Object.entries(final.dropped) as [Rejection, number][]) dropped[why] = (dropped[why] ?? 0) + n;
  return {
    ranked,
    counts: {
      found: pool.length,
      kept: cheap.kept.length,
      verified: checked.filter((c) => c.verified).length,
      judged: judged.length,
      recipes: verdicts.size,
      chosen: ranked.length,
      ytdlp_calls: run.calls.calls,
      ytdlp_failed: run.calls.failed,
      stopped: run.calls.blocked ? 'blocked' : null,
      dropped,
    },
  };
}

export type ForYouSummary = DiscoverCounts & { queries: number; followed: number; uploads: number };

/** The weekly look: up to FOR_YOU_COUNT new rows in `suggestions`. Nothing good found is not a failure. */
export async function discoverForYou(deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal, opts: DiscoverOptions): Promise<ForYouSummary> {
  const today = new Date(opts.now());
  const taste = await loadTaste(deps.db, job.household_id, today);
  const raw = await deps.ai.askJson(forYouQueriesRequest(taste.profile, today), 'for_you_queries', signal);
  const queries = normalizeQueries(raw, FOR_YOU_QUERIES, taste.profile.language);
  log.info('for_you_queries', { lang: taste.profile.language, queries: queries.map((q) => `${q.lang}: ${q.q}`) });

  const run = newRun(deps, job, log, signal, opts, taste, today);
  const followed = await followedVideos(run, excludedLinks(taste.known, 'for_you'));
  const searched = await searchAll(run, queries);
  const uploads = await cookedCreatorUploads(run);
  const { ranked, counts } = await choose(run, [...followed, ...searched, ...uploads], 'for_you', null, FOR_YOU_COUNT);
  await storeSuggestions(deps.db, suggestionRows(job.household_id, job.id, ranked));
  return { queries: queries.length, followed: followed.length, uploads: uploads.length, ...counts };
}

/** Find me: the best videos for the wish, or the failure the person sees. */
export async function discoverFind(deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal, opts: DiscoverOptions): Promise<FoundVideos> {
  const wish = cleanWish(job.input_text);
  if (wish === '') throw new ImportError('findNothing', { detail: 'nothing asked' });
  const today = new Date(opts.now());
  const taste = await loadTaste(deps.db, job.household_id, today);
  const raw = await deps.ai.askJson(findQueriesRequest(wish, taste.profile, today), 'find_queries', signal);
  const queries = findQueries(raw, wish, taste.profile.language);

  const run = newRun(deps, job, log, signal, opts, taste, today);
  const searched = await searchAll(run, queries);
  if (searched.length === 0 && run.calls.calls > 0 && run.calls.failed === run.calls.calls) {
    throw new ImportError('findFailed', { detail: `every search failed${run.calls.blocked ? ' (bot check)' : ''}` });
  }
  const { ranked, counts } = await choose(run, searched, 'find', wish, FIND_COUNT);
  log.info('find_done', { queries: queries.map((q) => `${q.lang}: ${q.q}`), ...counts });
  if (ranked.length === 0) throw new ImportError('findNothing', { detail: `${counts.recipes} recipes judged, none fit` });
  return foundVideos(wish, ranked);
}

export const runForYou = (deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<ForYouSummary> =>
  discoverForYou(deps, job, log, signal, { ...ytDlpDiscoverIO(deps.config), now: Date.now });

export const runFind = (deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<FoundVideos> =>
  discoverFind(deps, job, log, signal, { ...ytDlpDiscoverIO(deps.config), now: Date.now });
