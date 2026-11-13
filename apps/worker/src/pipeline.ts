// One import job → ExtractedRecipe, by source: website, image, text; videos and social posts live in
// pipeline-video.ts, several screenshots of one recipe in pipeline-screenshots.ts. Each path reports
// its stage and an early preview through ctx.progress.
import type { ExtractedRecipe, ImportJob, ImportPlatform } from '@mesa/shared';
import { webAuthor } from './author';
import { isYouTubeListLink } from './channel-url';
import { ImportError, isAbortError, MESSAGES } from './errors';
import { fetchPage, isModelImage, sniffImage } from './http';
import type { ImageSource } from './images';
import { ingredientsFromLines } from './ingredient-lines';
import { knownNames } from './known-names';
import { extractReadableText, parsePage, type WebRecipe } from './jsonld';
import type { Logger } from './log';
import {
  inlinePart,
  MAX_INLINE_IMAGE_BYTES,
  MIN_CAPTION,
  requireRecipe,
  textPart,
  type Ctx,
  type ImportResult,
} from './pipeline-common';
import type { ImportDeps } from './ports';
import { fromScreenshots, jobImagePaths } from './pipeline-screenshots';
import { fromVideoUrl, fromYouTube } from './pipeline-video';
import { noProgress, type Progress } from './progress';
import { sourcePrompt } from './prompts';
import { detectPlatform, extractFirstUrl, normalizeUrl } from './url';

export type { ImportResult, PipelineDeps } from './pipeline-common';

const MAX_TEXT_CHARS = 30_000;
const MIN_PAGE_TEXT = 200;

// Website -----------------------------------------------------------------------------------

async function recipeFromJsonLd(ctx: Ctx, web: WebRecipe, pageTitle: string | null): Promise<ExtractedRecipe> {
  const ingredients = await ingredientsFromLines(
    web.ingredients,
    ctx.catalog,
    (pending) => ctx.deps.ai.translateNames(pending, ctx.known(pending.map((p) => p.line)), ctx.signal),
    ctx.log,
  );
  return {
    title: web.title || pageTitle || 'Untitled recipe',
    servings: web.servings,
    total_minutes: web.totalMinutes,
    ingredients,
    steps: web.steps,
    language: web.language,
  };
}

async function fromWebsite(ctx: Ctx, url: string, extraText: string | null): Promise<ImportResult> {
  const page = await fetchPage(url, ctx.signal);
  if (page.kind === 'image') return fromImageBytes(ctx, page.bytes, 'web', url);

  const info = parsePage(page.html, page.finalUrl);
  const images = [info.recipe?.image, info.image].filter((u): u is string => typeof u === 'string');
  ctx.progress.preview({ title: info.recipe?.title ?? info.title, imageUrl: images[0] ?? null });
  ctx.progress.stage('reading');
  const image: ImageSource | null = images.length > 0 ? { kind: 'url', urls: images } : null;
  const author = webAuthor(info);

  if (info.recipe && info.recipe.ingredients.length > 0) {
    ctx.log.info('jsonld_recipe', { ingredients: info.recipe.ingredients.length, steps: info.recipe.steps.length });
    const recipe = await recipeFromJsonLd(ctx, info.recipe, info.title);
    if (recipe.ingredients.length > 0) return { recipe, platform: 'web', sourceUrl: url, image, author };
  }

  const text = extractReadableText(page.html, MAX_TEXT_CHARS);
  ctx.log.info('page_text', { chars: text.length, jsonld: info.recipe !== null });
  if (text.length < MIN_PAGE_TEXT && !extraText) throw new ImportError('pageEmpty', { detail: `${text.length} chars` });
  const outcome = await ctx.deps.ai.extractRecipe(
    [textPart(sourcePrompt({ kind: 'web page', url, title: info.title, caption: extraText ?? info.description }, text))],
    ctx.known([info.title, extraText ?? info.description, text]),
    ctx.signal,
  );
  return { recipe: requireRecipe(outcome, info.title), platform: 'web', sourceUrl: url, image, author };
}

// Video / social ------------------------------------------------------------------------------

// Image and text ------------------------------------------------------------------------------

async function fromImageBytes(ctx: Ctx, bytes: Buffer, platform: ImportPlatform, sourceUrl: string | null): Promise<ImportResult> {
  const type = sniffImage(bytes);
  const detected = type?.mime ?? 'unknown bytes';
  if (!isModelImage(type)) throw new ImportError('imageUnsupported', { detail: detected });
  if (bytes.length > MAX_INLINE_IMAGE_BYTES) throw new ImportError('imageTooLarge', { detail: `${bytes.length} bytes` });
  ctx.progress.stage('reading');
  const outcome = await ctx.deps.ai.extractRecipe(
    [inlinePart(bytes, type.mime), textPart(sourcePrompt({ kind: 'screenshot or photo', url: sourceUrl }))],
    ctx.known(),
    ctx.signal,
  );
  const recipe = requireRecipe(outcome, null);
  // A screenshot of text makes a poor recipe picture: keep it only when it shows the dish. A kept photo
  // becomes its own copy in the recipe pictures: what was shared stays private, and goes.
  const showsDish = outcome.kind === 'recipe' && outcome.imageShowsDish === true;
  const image: ImageSource | null = showsDish ? { kind: 'bytes', bytes } : null;
  return { recipe, platform, sourceUrl, image };
}

async function fromStoredImage(ctx: Ctx, path: string): Promise<ImportResult> {
  return fromImageBytes(ctx, await ctx.deps.media.read(ctx.job.household_id, path), 'image', null);
}

async function fromText(ctx: Ctx, text: string): Promise<ImportResult> {
  const body = text.trim().slice(0, MAX_TEXT_CHARS);
  if (body.length === 0) throw new ImportError('nothingToImport');
  ctx.progress.stage('reading');
  const outcome = await ctx.deps.ai.extractRecipe([textPart(sourcePrompt({ kind: 'pasted text' }, body))], ctx.known(body), ctx.signal);
  return { recipe: requireRecipe(outcome, null), platform: 'text', sourceUrl: null, image: null };
}

// Routing -------------------------------------------------------------------------------------

async function fromUrl(ctx: Ctx, rawUrl: string, extraText: string | null): Promise<ImportResult> {
  const url = normalizeUrl(rawUrl);
  const platform = detectPlatform(url);
  ctx.log.info('import_url', { url, platform });
  switch (platform) {
    case 'youtube':
      return fromYouTube(ctx, url, extraText);
    case 'instagram':
    case 'tiktok':
    case 'other':
      return fromVideoUrl(ctx, url, platform, extraText);
    case 'web':
      return fromWebsite(ctx, url, extraText);
  }
}

function jobUrl(job: ImportJob): string | null {
  return job.input_url?.trim() || (job.input_text ? extractFirstUrl(job.input_text) : null);
}

/** The canonical link a job imports (as stored in recipes.source_url), null for images and plain text. */
export function jobSourceUrl(job: ImportJob): string | null {
  if (jobImagePaths(job).length > 0) return null;
  const url = jobUrl(job);
  return url ? normalizeUrl(url) : null;
}

/** The platform stored on the job, known before processing (also used when it fails). */
export function jobPlatform(job: ImportJob): ImportPlatform {
  if (jobImagePaths(job).length > 0) return 'image';
  const url = jobUrl(job);
  return url ? detectPlatform(normalizeUrl(url)) : 'text';
}

export async function runImport(
  deps: ImportDeps,
  job: ImportJob,
  log: Logger,
  signal: AbortSignal,
  progress: Progress = noProgress,
): Promise<ImportResult> {
  const catalog = await deps.catalog.forHousehold(job.household_id);
  const ctx: Ctx = { deps, job, log, signal, catalog, known: (text) => knownNames(catalog, text), progress };
  const images = jobImagePaths(job);
  if (images.length > 1) return fromScreenshots(ctx, images);
  const image = job.input_image_path ?? images[0];
  if (image) return fromStoredImage(ctx, image);

  const url = jobUrl(job);
  if (url) {
    // A channel or playlist is many recipes, not one: it is opened as a creator to pick videos.
    if (isYouTubeListLink(url)) throw new ImportError('creatorLink', { detail: normalizeUrl(url) });
    // Text shared along with the link (a caption, a note) helps the model, and is the fallback.
    const extra = job.input_text ? job.input_text.replace(url, ' ').replace(/\s+/g, ' ').trim() : '';
    const extraText = extra.length >= MIN_CAPTION ? extra : null;
    try {
      return await fromUrl(ctx, url, extraText);
    } catch (err) {
      if (signal.aborted || isAbortError(err) || !extraText || extraText.length < 80) throw err;
      log.warn('url_failed_using_text', { err });
      return { ...(await fromText(ctx, extraText)), sourceUrl: normalizeUrl(url) };
    }
  }
  if (job.input_text) return fromText(ctx, job.input_text);
  throw new ImportError('nothingToImport');
}
