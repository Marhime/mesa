// "More from Food is Love": a creator's latest recipe videos, answered in import_jobs.result. The creator
// comes from a link (a channel in any form, a playlist, or one of their videos) or from a saved recipe,
// whose channel is found from its video — and remembered on the recipe — when it doesn't know it yet.
// YouTube only for now: the other platforms can't be listed without logging in.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatorVideos, ImportJob } from '@mesa/shared';

import type { SourceAuthor } from './author';
import { CHANNEL_ID, channelPageUrl, channelUrlFromId, channelVideosUrl, parseChannelUrl, type ChannelRef } from './channel-url';
import {
  candidateVideos,
  creatorSystemPrompt,
  creatorUserPrompt,
  creatorVideoList,
  CREATOR_SCHEMA,
  recipeVerdicts,
  watchUrl,
} from './creator-videos';
import type { Config } from './config';
import { ImportError, isAbortError } from './errors';
import type { Logger } from './log';
import { textPart, withWorkDir, ytOptions, type PipelineDeps } from './pipeline-common';
import { normalizeUrl, youtubeVideoId } from './url';
import { fetchVideoMeta, YtDlpError } from './ytdlp';
import { listChannelVideos, type ChannelListing, type FlatVideo } from './ytdlp-channel';

const VIDEO_META_TIMEOUT_MS = 45_000;

/** Where a creator's videos come from (yt-dlp in production, a fake in tests). */
export interface ChannelSource {
  /** The latest videos of a channel's Videos tab or of a playlist, flat. */
  list(url: string, signal: AbortSignal): Promise<ChannelListing>;
  /** Who posted one video. */
  videoAuthor(url: string, signal: AbortSignal): Promise<SourceAuthor | null>;
}

export function ytDlpChannelSource(config: Config): ChannelSource {
  const opts = ytOptions(config);
  return {
    list: (url, signal) => withWorkDir((dir) => listChannelVideos(opts, url, dir, signal)),
    videoAuthor: async (url, signal) => (await withWorkDir((dir) => fetchVideoMeta(opts, url, dir, signal, VIDEO_META_TIMEOUT_MS))).author,
  };
}

/** A gone or unknown channel / video is "not found"; anything else from yt-dlp may pass ("try again"). */
function sourceError(err: unknown): unknown {
  if (isAbortError(err) || !(err instanceof YtDlpError)) return err;
  const gone = err.code === 'videoUnavailable' || err.code === 'unsupportedLink';
  return new ImportError(gone ? 'creatorNotFound' : 'creatorFailed', { cause: err, detail: err.message });
}

/** The channel to list, and what is already known about its creator. */
interface Target {
  ref: ChannelRef;
  known: SourceAuthor | null;
}

const unsupported = (detail: string): ImportError => new ImportError('creatorUnsupported', { detail });

/** The channel of one YouTube video. */
async function channelOfVideo(source: ChannelSource, videoUrl: string, signal: AbortSignal): Promise<Target & { known: SourceAuthor }> {
  const author = await source.videoAuthor(videoUrl, signal).catch((err: unknown) => {
    throw sourceError(err);
  });
  const ref = author?.channelUrl ? parseChannelUrl(author.channelUrl) : null;
  if (!author || !ref) throw new ImportError('creatorNotFound', { detail: `no channel for ${videoUrl}` });
  return { ref, known: author };
}

async function targetFromUrl(source: ChannelSource, input: string, signal: AbortSignal): Promise<Target> {
  const ref = parseChannelUrl(input);
  if (ref) return { ref, known: null };
  if (youtubeVideoId(input)) return channelOfVideo(source, normalizeUrl(input), signal);
  throw unsupported(`not a YouTube channel: ${input.slice(0, 200)}`);
}

interface RecipeSource {
  id: string;
  source_url: string | null;
  source_platform: string;
  source_author: string | null;
  source_channel_url: string | null;
  source_channel_id: string | null;
}

/** Remembers who made the recipe (best effort: the list is shown either way). */
async function rememberAuthor(db: SupabaseClient, recipe: RecipeSource, householdId: string, author: SourceAuthor, log: Logger): Promise<void> {
  const { error } = await db
    .from('recipes')
    .update({ source_author: author.name, source_channel_url: author.channelUrl, source_channel_id: author.channelId })
    .eq('id', recipe.id)
    .eq('household_id', householdId);
  if (error) log.warn('creator_remember_failed', { recipe: recipe.id, err: error.message });
}

async function targetFromRecipe(deps: PipelineDeps, source: ChannelSource, job: ImportJob, recipeId: string, log: Logger, signal: AbortSignal): Promise<Target> {
  const { data, error } = await deps.db
    .from('recipes')
    .select('id, source_url, source_platform, source_author, source_channel_url, source_channel_id')
    .eq('id', recipeId)
    .eq('household_id', job.household_id)
    .maybeSingle();
  if (error) throw new Error(`recipe: ${error.message}`);
  const recipe = data as RecipeSource | null;
  if (!recipe) throw new ImportError('creatorFailed', { detail: 'recipe not found' });

  const channelId = recipe.source_channel_id && CHANNEL_ID.test(recipe.source_channel_id) ? recipe.source_channel_id : null;
  const page = recipe.source_channel_url ?? (channelId ? channelUrlFromId(channelId) : null);
  if (page) {
    const ref = parseChannelUrl(page);
    if (!ref) throw unsupported(`channel ${page}`);
    const known = recipe.source_author ? { name: recipe.source_author, channelUrl: page, channelId } : null;
    return { ref, known };
  }
  const videoUrl = recipe.source_url && youtubeVideoId(recipe.source_url) ? normalizeUrl(recipe.source_url) : null;
  if (!videoUrl) throw unsupported(`recipe from ${recipe.source_platform}`);
  const target = await channelOfVideo(source, videoUrl, signal);
  await rememberAuthor(deps.db, recipe, job.household_id, target.known, log);
  return target;
}

/** The household's saved recipes among these links (normalized as recipes.source_url is). */
export async function savedUrls(db: SupabaseClient, householdId: string, urls: readonly string[], log: Logger): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const { data, error } = await db.from('recipes').select('source_url').eq('household_id', householdId).in('source_url', urls);
  if (error) {
    log.warn('creator_saved_lookup_failed', { err: error.message });
    return new Set();
  }
  return new Set(((data ?? []) as { source_url: string | null }[]).flatMap((r) => (r.source_url ? [normalizeUrl(r.source_url)] : [])));
}

/** How the creator is named and linked: the listing first, then what was known, then the link itself. */
function creatorOf(target: Target, listing: ChannelListing): CreatorVideos['creator'] {
  const { ref, known } = target;
  const knownId = known?.channelId && CHANNEL_ID.test(known.channelId) ? known.channelId : null;
  const channelId = listing.channelId ?? knownId ?? (ref.kind === 'channel' ? ref.id : null);
  const label = ref.kind === 'handle' ? `@${ref.handle}` : ref.kind === 'channel' || ref.kind === 'playlist' ? ref.id : ref.name;
  return {
    name: listing.name ?? known?.name ?? label,
    url: channelId ? channelUrlFromId(channelId) : channelPageUrl(ref),
    channel_id: channelId ?? label,
    platform: 'youtube',
  };
}

/** One question for all the videos: which are recipes, and the dish of each. */
export async function askRecipes(deps: PipelineDeps, creator: string, candidates: readonly FlatVideo[], signal: AbortSignal): Promise<Map<string, string | null>> {
  if (candidates.length === 0) return new Map();
  const raw = await deps.ai.askJson(
    { parts: [textPart(creatorUserPrompt(creator, candidates))], systemInstruction: creatorSystemPrompt(), schema: CREATOR_SCHEMA },
    'creator_videos',
    signal,
  );
  const verdicts = recipeVerdicts(raw, new Set(candidates.map((v) => v.id)));
  if (!verdicts) throw new ImportError('creatorFailed', { detail: 'unreadable model answer' });
  return verdicts;
}

/** Lists the creator's videos and keeps the recipes. `source` is yt-dlp unless a test gives another. */
export async function findCreatorVideos(
  deps: PipelineDeps,
  job: ImportJob,
  log: Logger,
  signal: AbortSignal,
  source: ChannelSource,
): Promise<CreatorVideos> {
  const input = job.input_url?.trim();
  let target: Target;
  if (input) target = await targetFromUrl(source, input, signal);
  else if (job.subject_id) target = await targetFromRecipe(deps, source, job, job.subject_id, log, signal);
  else throw new ImportError('creatorFailed', { detail: 'no link or recipe' });

  const listing = await source.list(channelVideosUrl(target.ref), signal).catch((err: unknown) => {
    throw sourceError(err);
  });
  const creator = creatorOf(target, listing);
  const candidates = candidateVideos(listing.videos);
  const verdicts = await askRecipes(deps, creator.name, candidates, signal);
  const recipeUrls = candidates.filter((v) => verdicts.has(v.id)).map((v) => watchUrl(v.id));
  const saved = await savedUrls(deps.db, job.household_id, recipeUrls, log);
  const videos = creatorVideoList(candidates, verdicts, saved);
  log.info('creator_done', {
    channel: creator.channel_id,
    from: input ? 'link' : 'recipe',
    listed: listing.videos.length,
    candidates: candidates.length,
    recipes: verdicts.size,
    shown: videos.length,
    saved: videos.filter((v) => v.saved).length,
  });
  return { creator, videos };
}

export const runCreator = (deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<CreatorVideos> =>
  findCreatorVideos(deps, job, log, signal, ytDlpChannelSource(deps.config));
