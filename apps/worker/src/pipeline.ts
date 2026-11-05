// One import job → ExtractedRecipe, by source: website, YouTube, other video/social links, image, text.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError, type Part } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseIngredientLine, type ExtractedIngredient, type ExtractedRecipe, type ImportJob, type ImportPlatform } from '@mesa/shared';
import type { CatalogStore } from './catalog-store';
import type { Config } from './config';
import { ImportError, isAbortError, MESSAGES } from './errors';
import type { RecipeAI, UploadedFile } from './gemini';
import { downloadImage, fetchPage, isModelImage, sniffImage } from './http';
import { RECIPE_IMAGES_BUCKET, type ImageSource } from './images';
import { extractReadableText, parsePage, type WebRecipe } from './jsonld';
import type { Logger } from './log';
import { isExactMatch, matchIngredient, type Catalog } from './mapping';
import type { ModelOutcome, Translation } from './model-output';
import { sourcePrompt, type SourceContext } from './prompts';
import { detectPlatform, extractFirstUrl, normalizeUrl, youtubeVideoId, type UrlPlatform } from './url';
import { downloadVideo, fetchVideoMeta, YtDlpError, type VideoMeta, type YtDlpOptions } from './ytdlp';

export interface PipelineDeps {
  config: Config;
  db: SupabaseClient;
  ai: RecipeAI;
  catalog: CatalogStore;
}

export interface ImportResult {
  recipe: ExtractedRecipe;
  platform: ImportPlatform;
  sourceUrl: string | null;
  image: ImageSource | null;
}

interface Ctx {
  deps: PipelineDeps;
  job: ImportJob;
  log: Logger;
  signal: AbortSignal;
  /** Product names offered to the model for name_en. */
  known: string[];
}

const MAX_INLINE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_POST_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;
const MIN_PAGE_TEXT = 200;
const MIN_CAPTION = 20;
const OPTIONAL_LINE = /\b(?:opcional|optional|facultatif|para decorar|para servir|for garnish|to serve|pour servir)\b/i;

const PLATFORM_LABEL: Record<UrlPlatform, string> = {
  youtube: 'YouTube video',
  instagram: 'Instagram post',
  tiktok: 'TikTok video',
  other: 'social media post',
  web: 'web page',
};

/** Turns the model outcome into a recipe, or the failure the person should see. */
function requireRecipe(outcome: ModelOutcome, fallbackTitle: string | null | undefined, emptyMessage: string = MESSAGES.noIngredients): ExtractedRecipe {
  if (outcome.kind === 'not_recipe') throw new ImportError(MESSAGES.notRecipe);
  const recipe = outcome.recipe;
  if (recipe.ingredients.length === 0) throw new ImportError(emptyMessage, { detail: 'no ingredients' });
  if (recipe.title.trim() === '' && fallbackTitle) recipe.title = fallbackTitle.slice(0, 200);
  return recipe;
}

const textPart = (text: string): Part => ({ text });
const inlinePart = (bytes: Buffer, mimeType: string): Part => ({ inlineData: { mimeType, data: bytes.toString('base64') } });

// Website -----------------------------------------------------------------------------------

/**
 * JSON-LD ingredient lines, parsed locally with parseIngredientLine. Lines whose label is exactly a
 * catalog product need nothing else; the rest get name_en + category from one batched model call
 * (skipped when every line matched). If that call fails, the local label stands in for name_en.
 */
export async function ingredientsFromLines(
  lines: readonly string[],
  catalog: Catalog,
  translate: (pending: Array<{ i: number; line: string }>) => Promise<Map<number, Translation>>,
  log: Logger,
): Promise<ExtractedIngredient[]> {
  const parsed = lines.map((line) => ({ line, item: parseIngredientLine(line) }));
  const out: ExtractedIngredient[] = parsed.map(({ line, item }) => {
    const product = item.label !== '' ? matchIngredient(catalog, '', item.label) : null;
    const exact = product !== null && isExactMatch(catalog, product, item.label);
    return {
      raw_text: line,
      name_en: exact ? product.name_en.toLowerCase() : '',
      quantity: item.quantity,
      unit: item.unit,
      is_guessed: false,
      is_optional: OPTIONAL_LINE.test(line),
      category: exact ? product.category : null,
    };
  });

  const pending = out.flatMap((ing, i) => (ing.name_en === '' ? [{ i, line: ing.raw_text }] : []));
  if (pending.length > 0) {
    let translations = new Map<number, Translation>();
    try {
      translations = await translate(pending);
    } catch (err) {
      if (isAbortError(err)) throw err;
      log.warn('translate_failed', { err, lines: pending.length });
    }
    for (const { i } of pending) {
      const ing = out[i]!;
      const t = translations.get(i);
      if (t) {
        ing.name_en = t.name_en;
        ing.category = t.category;
        ing.is_optional = ing.is_optional || t.is_optional;
      } else {
        // No English name: trust the plain label match (as the app does for typed groceries).
        const label = parsed[i]!.item.label;
        const product = label !== '' ? matchIngredient(catalog, '', label) : null;
        ing.name_en = (product?.name_en ?? label).toLowerCase();
        ing.category = product?.category ?? null;
      }
    }
  }
  return out.filter((ing) => ing.name_en !== '' && /\p{L}/u.test(ing.raw_text));
}

async function recipeFromJsonLd(ctx: Ctx, web: WebRecipe, pageTitle: string | null): Promise<ExtractedRecipe> {
  const catalog = ctx.deps.catalog.forHousehold(ctx.job.household_id);
  const ingredients = await ingredientsFromLines(
    web.ingredients,
    catalog,
    (pending) => ctx.deps.ai.translateNames(pending, ctx.known, ctx.signal),
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
  if (page.kind === 'image') return fromImageBytes(ctx, page.bytes, 'web', url, null);

  const info = parsePage(page.html, page.finalUrl);
  const images = [info.recipe?.image, info.image].filter((u): u is string => typeof u === 'string');
  const image: ImageSource | null = images.length > 0 ? { kind: 'url', urls: images } : null;

  if (info.recipe && info.recipe.ingredients.length > 0) {
    ctx.log.info('jsonld_recipe', { ingredients: info.recipe.ingredients.length, steps: info.recipe.steps.length });
    const recipe = await recipeFromJsonLd(ctx, info.recipe, info.title);
    if (recipe.ingredients.length > 0) return { recipe, platform: 'web', sourceUrl: url, image };
  }

  const text = extractReadableText(page.html, MAX_TEXT_CHARS);
  ctx.log.info('page_text', { chars: text.length, jsonld: info.recipe !== null });
  if (text.length < MIN_PAGE_TEXT && !extraText) throw new ImportError(MESSAGES.pageEmpty, { detail: `${text.length} chars` });
  const outcome = await ctx.deps.ai.extractRecipe(
    [textPart(sourcePrompt({ kind: 'web page', url, title: info.title, caption: extraText ?? info.description }, text))],
    ctx.known,
    ctx.signal,
  );
  return { recipe: requireRecipe(outcome, info.title), platform: 'web', sourceUrl: url, image };
}

// Video / social ------------------------------------------------------------------------------

const ytOptions = (config: Config): YtDlpOptions => ({ path: config.ytdlpPath, cookies: config.ytdlpCookies });

async function withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'mesa-import-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** YouTube: Gemini watches the URL itself; the description (yt-dlp, best effort) is added as text. */
async function fromYouTube(ctx: Ctx, url: string, extraText: string | null): Promise<ImportResult> {
  const id = youtubeVideoId(url);
  const image: ImageSource | null = id ? { kind: 'url', urls: [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`] } : null;
  const meta = await withWorkDir((dir) =>
    fetchVideoMeta(ytOptions(ctx.deps.config), url, dir, ctx.signal, 25_000).catch((err: unknown) => {
      if (ctx.signal.aborted || isAbortError(err)) throw err;
      ctx.log.info('youtube_meta_unavailable', { err });
      return null;
    }),
  );
  const caption = [meta?.description, extraText].filter(Boolean).join('\n\n') || null;
  try {
    const outcome = await ctx.deps.ai.extractRecipe(
      [{ fileData: { fileUri: url } }, textPart(sourcePrompt({ kind: 'YouTube video', url, title: meta?.title, caption }))],
      ctx.known,
      ctx.signal,
    );
    return { recipe: requireRecipe(outcome, meta?.title), platform: 'youtube', sourceUrl: url, image };
  } catch (err) {
    // Private, age-restricted or region-locked videos are refused with a 4xx: try downloading instead.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      ctx.log.warn('youtube_url_rejected', { status: err.status, err: err.message });
      const result = await fromVideoUrl(ctx, url, 'youtube', extraText);
      return { ...result, image: result.image ?? image };
    }
    throw err;
  }
}

/** Open Graph tags of a social page: one more way to get the caption when yt-dlp is blocked. */
async function captionFromPage(ctx: Ctx, url: string): Promise<{ caption: string | null; title: string | null; image: string | null }> {
  try {
    const page = await fetchPage(url, ctx.signal);
    if (page.kind !== 'html') return { caption: null, title: null, image: null };
    const info = parsePage(page.html, page.finalUrl);
    return { caption: info.description, title: info.title, image: info.image };
  } catch (err) {
    if (ctx.signal.aborted || isAbortError(err)) throw err;
    return { caption: null, title: null, image: null };
  }
}

async function downloadPostImages(urls: readonly string[], signal: AbortSignal): Promise<Array<{ bytes: Buffer; mime: string }>> {
  const out: Array<{ bytes: Buffer; mime: string }> = [];
  let total = 0;
  for (const url of urls) {
    const img = await downloadImage(url, MAX_POST_IMAGE_BYTES, signal);
    if (!img || !isModelImage(img.type)) continue;
    if (total + img.bytes.length > MAX_INLINE_IMAGE_BYTES) break;
    total += img.bytes.length;
    out.push({ bytes: img.bytes, mime: img.type.mime });
  }
  return out;
}

/**
 * Instagram, TikTok and other hosts: yt-dlp metadata → small mp4 → Gemini Files API → extraction.
 * Image posts are sent inline. When the media can't be had, the caption alone is used if there is one.
 */
async function fromVideoUrl(ctx: Ctx, url: string, platform: UrlPlatform, extraText: string | null): Promise<ImportResult> {
  const opts = ytOptions(ctx.deps.config);
  const dbPlatform: ImportPlatform = platform === 'web' ? 'other' : platform;

  return withWorkDir(async (dir) => {
    let meta: VideoMeta | null = null;
    let failure: unknown = null;
    try {
      meta = await fetchVideoMeta(opts, url, dir, ctx.signal);
      ctx.log.info('video_meta', {
        has_video: meta.hasVideo,
        images: meta.imageUrls.length,
        duration: meta.duration,
        caption_chars: meta.description?.length ?? 0,
      });
    } catch (err) {
      if (ctx.signal.aborted || isAbortError(err)) throw err;
      failure = err;
      ctx.log.warn('video_meta_failed', { err, stderr: err instanceof YtDlpError ? err.stderrTail.slice(-800) : undefined });
    }

    const og = meta ? null : await captionFromPage(ctx, url);
    const title = meta?.title ?? og?.title ?? null;
    const caption = [meta?.description ?? og?.caption, extraText].filter(Boolean).join('\n\n') || null;
    const thumbnail = meta?.thumbnail ?? og?.image ?? null;
    const source: SourceContext = { kind: PLATFORM_LABEL[platform], url, title, caption };
    const thumbImage: ImageSource | null = thumbnail ? { kind: 'url', urls: [thumbnail] } : null;
    const done = (recipe: ExtractedRecipe, image: ImageSource | null): ImportResult => ({ recipe, platform: dbPlatform, sourceUrl: url, image });

    if (meta?.hasVideo) {
      let uploaded: UploadedFile | null = null;
      try {
        try {
          const video = await downloadVideo(opts, url, meta, dir, ctx.signal);
          ctx.log.info('video_downloaded', { bytes: video.bytes, mime: video.mimeType });
          uploaded = await ctx.deps.ai.uploadFile(video.path, video.mimeType, ctx.signal);
        } catch (err) {
          if (ctx.signal.aborted || isAbortError(err)) throw err;
          failure = err;
          ctx.log.warn('video_unavailable', { err, stderr: err instanceof YtDlpError ? err.stderrTail.slice(-800) : undefined });
        }
        if (uploaded) {
          const outcome = await ctx.deps.ai.extractRecipe(
            [{ fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } }, textPart(sourcePrompt(source))],
            ctx.known,
            ctx.signal,
          );
          return done(requireRecipe(outcome, title), thumbImage);
        }
      } finally {
        if (uploaded) await ctx.deps.ai.deleteFile(uploaded.name);
      }
    } else if (meta && meta.imageUrls.length > 0) {
      const images = await downloadPostImages(meta.imageUrls, ctx.signal);
      ctx.log.info('post_images', { listed: meta.imageUrls.length, downloaded: images.length });
      if (images.length > 0) {
        const outcome = await ctx.deps.ai.extractRecipe(
          [...images.map((img) => inlinePart(img.bytes, img.mime)), textPart(sourcePrompt(source))],
          ctx.known,
          ctx.signal,
        );
        return done(requireRecipe(outcome, title), { kind: 'bytes', bytes: images[0]!.bytes });
      }
    }

    // Caption alone: yt-dlp blocked, a private post, or no media we could read.
    const mediaMessage = failure instanceof ImportError ? failure.userMessage : MESSAGES.videoFailed;
    if (caption && caption.trim().length >= MIN_CAPTION) {
      ctx.log.info('caption_only', { chars: caption.length });
      const outcome = await ctx.deps.ai.extractRecipe([textPart(sourcePrompt(source))], ctx.known, ctx.signal);
      // Without the video, "no recipe in the caption" means "couldn't get the video".
      if (outcome.kind === 'not_recipe' && failure) throw new ImportError(mediaMessage, { cause: failure, detail: 'caption is not a recipe' });
      return done(requireRecipe(outcome, title, failure ? mediaMessage : MESSAGES.noIngredients), thumbImage);
    }
    throw new ImportError(mediaMessage, { cause: failure, detail: 'no video, images or caption' });
  });
}

// Image and text ------------------------------------------------------------------------------

async function fromImageBytes(
  ctx: Ctx,
  bytes: Buffer,
  platform: ImportPlatform,
  sourceUrl: string | null,
  storedPath: string | null,
): Promise<ImportResult> {
  const type = sniffImage(bytes);
  const detected = type?.mime ?? 'unknown bytes';
  if (!isModelImage(type)) throw new ImportError(MESSAGES.imageUnsupported, { detail: detected });
  if (bytes.length > MAX_INLINE_IMAGE_BYTES) throw new ImportError(MESSAGES.imageTooLarge, { detail: `${bytes.length} bytes` });
  const outcome = await ctx.deps.ai.extractRecipe(
    [inlinePart(bytes, type.mime), textPart(sourcePrompt({ kind: 'screenshot or photo', url: sourceUrl }))],
    ctx.known,
    ctx.signal,
  );
  const recipe = requireRecipe(outcome, null);
  // A screenshot of text makes a poor recipe picture: keep it only when it shows the dish.
  const showsDish = outcome.kind === 'recipe' && outcome.imageShowsDish === true;
  const image: ImageSource | null = !showsDish ? null : storedPath ? { kind: 'path', path: storedPath } : { kind: 'bytes', bytes };
  return { recipe, platform, sourceUrl, image };
}

async function fromStoredImage(ctx: Ctx, path: string): Promise<ImportResult> {
  const { data, error } = await ctx.deps.db.storage.from(RECIPE_IMAGES_BUCKET).download(path);
  if (error || !data) throw new ImportError(MESSAGES.imageMissing, { detail: error?.message ?? 'no data' });
  const bytes = Buffer.from(await data.arrayBuffer());
  // Only a file in the household's own folder may become its recipe image.
  const own = path.startsWith(`${ctx.job.household_id}/`);
  return fromImageBytes(ctx, bytes, 'image', null, own ? path : null);
}

async function fromText(ctx: Ctx, text: string): Promise<ImportResult> {
  const body = text.trim().slice(0, MAX_TEXT_CHARS);
  if (body.length === 0) throw new ImportError(MESSAGES.nothingToImport);
  const outcome = await ctx.deps.ai.extractRecipe([textPart(sourcePrompt({ kind: 'pasted text' }, body))], ctx.known, ctx.signal);
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

/** The platform stored on the job, known before processing (also used when it fails). */
export function jobPlatform(job: ImportJob): ImportPlatform {
  if (job.input_image_path) return 'image';
  const url = jobUrl(job);
  return url ? detectPlatform(normalizeUrl(url)) : 'text';
}

export async function runImport(deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<ImportResult> {
  const ctx: Ctx = { deps, job, log, signal, known: deps.catalog.knownNames(job.household_id) };
  if (job.input_image_path) return fromStoredImage(ctx, job.input_image_path);

  const url = jobUrl(job);
  if (url) {
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
  throw new ImportError(MESSAGES.nothingToImport);
}
