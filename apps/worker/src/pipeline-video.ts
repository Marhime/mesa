// Videos and social posts: YouTube (Gemini watches the URL), Instagram, TikTok and other hosts
// (yt-dlp → small mp4 → Gemini Files API), image posts, and the caption as a last resort.
import type { ExtractedRecipe, ImportPlatform } from '@mesa/shared';
import { ImportError, isAbortError } from './errors';
import { isModelRefused } from './model-port';
import type { UploadedFile } from './gemini';
import { downloadImage, fetchPage, isModelImage } from './http';
import type { ImageSource } from './images';
import { parsePage } from './jsonld';
import {
  inlinePart,
  MAX_INLINE_IMAGE_BYTES,
  MIN_CAPTION,
  requireRecipe,
  textPart,
  withWorkDir,
  type Ctx,
  type ImportResult,
} from './pipeline-common';
import { sourcePrompt, type SourceContext } from './prompts';
import { youtubeVideoId, type UrlPlatform } from './url';
import { downloadVideo, fetchVideoMeta, YtDlpError, type VideoMeta } from './ytdlp';

const MAX_POST_IMAGE_BYTES = 7 * 1024 * 1024;

const PLATFORM_LABEL: Record<UrlPlatform, string> = {
  youtube: 'YouTube video',
  instagram: 'Instagram post',
  tiktok: 'TikTok video',
  other: 'social media post',
  web: 'web page',
};

/** YouTube: Gemini watches the URL itself; the description (yt-dlp, best effort) is added as text. */
export async function fromYouTube(ctx: Ctx, url: string, extraText: string | null): Promise<ImportResult> {
  const id = youtubeVideoId(url);
  const image: ImageSource | null = id ? { kind: 'url', urls: [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`] } : null;
  if (id) ctx.progress.preview({ imageUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
  const meta = await withWorkDir((dir) =>
    fetchVideoMeta(ctx.deps.ytdlp, url, dir, ctx.signal, 25_000).catch((err: unknown) => {
      if (ctx.signal.aborted || isAbortError(err)) throw err;
      ctx.log.info('youtube_meta_unavailable', { err });
      return null;
    }),
  );
  const caption = [meta?.description, extraText].filter(Boolean).join('\n\n') || null;
  ctx.progress.preview({ title: meta?.title });
  ctx.progress.stage('watching');
  try {
    const outcome = await ctx.deps.ai.extractRecipe(
      [{ fileData: { fileUri: url } }, textPart(sourcePrompt({ kind: 'YouTube video', url, title: meta?.title, caption }))],
      ctx.known([meta?.title, caption]),
      ctx.signal,
    );
    return { recipe: requireRecipe(outcome, meta?.title), platform: 'youtube', sourceUrl: url, image, author: meta?.author ?? null };
  } catch (err) {
    // Private, age-restricted or region-locked videos are refused by the model: try downloading instead.
    if (isModelRefused(err)) {
      ctx.log.warn('youtube_url_rejected', { err: err.message });
      const result = await fromVideoUrl(ctx, url, 'youtube', extraText);
      return { ...result, image: result.image ?? image, author: result.author ?? meta?.author ?? null };
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
export async function fromVideoUrl(ctx: Ctx, url: string, platform: UrlPlatform, extraText: string | null): Promise<ImportResult> {
  const opts = ctx.deps.ytdlp;
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
    ctx.progress.preview({ title, imageUrl: thumbnail });
    const done = (recipe: ExtractedRecipe, image: ImageSource | null): ImportResult => ({
      recipe,
      platform: dbPlatform,
      sourceUrl: url,
      image,
      author: meta?.author ?? null,
    });

    if (meta?.hasVideo) {
      let uploaded: UploadedFile | null = null;
      try {
        try {
          ctx.progress.stage('downloading');
          const video = await downloadVideo(opts, url, meta, dir, ctx.signal);
          ctx.log.info('video_downloaded', { bytes: video.bytes, mime: video.mimeType });
          uploaded = await ctx.deps.ai.uploadFile(video.path, video.mimeType, ctx.signal);
        } catch (err) {
          if (ctx.signal.aborted || isAbortError(err)) throw err;
          failure = err;
          ctx.log.warn('video_unavailable', { err, stderr: err instanceof YtDlpError ? err.stderrTail.slice(-800) : undefined });
        }
        if (uploaded) {
          ctx.progress.stage('watching');
          const outcome = await ctx.deps.ai.extractRecipe(
            [{ fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } }, textPart(sourcePrompt(source))],
            ctx.known([title, caption]),
            ctx.signal,
          );
          return done(requireRecipe(outcome, title), thumbImage);
        }
      } finally {
        if (uploaded) await ctx.deps.ai.deleteFile(uploaded.name);
      }
    } else if (meta && meta.imageUrls.length > 0) {
      ctx.progress.stage('downloading');
      const images = await downloadPostImages(meta.imageUrls, ctx.signal);
      ctx.log.info('post_images', { listed: meta.imageUrls.length, downloaded: images.length });
      if (images.length > 0) {
        ctx.progress.stage('reading');
        const outcome = await ctx.deps.ai.extractRecipe(
          [...images.map((img) => inlinePart(img.bytes, img.mime)), textPart(sourcePrompt(source))],
          ctx.known([title, caption]),
          ctx.signal,
        );
        return done(requireRecipe(outcome, title), { kind: 'bytes', bytes: images[0]!.bytes });
      }
    }

    // Caption alone: yt-dlp blocked, a private post, or no media we could read.
    const mediaFailure = failure instanceof ImportError ? failure.code : 'videoFailed';
    if (caption && caption.trim().length >= MIN_CAPTION) {
      ctx.log.info('caption_only', { chars: caption.length });
      ctx.progress.stage('reading');
      const outcome = await ctx.deps.ai.extractRecipe([textPart(sourcePrompt(source))], ctx.known([title, caption]), ctx.signal);
      // Without the video, "no recipe in the caption" means "couldn't get the video".
      if (outcome.kind === 'not_recipe' && failure) throw new ImportError(mediaFailure, { cause: failure, detail: 'caption is not a recipe' });
      return done(requireRecipe(outcome, title, failure ? mediaFailure : 'noIngredients'), thumbImage);
    }
    throw new ImportError(mediaFailure, { cause: failure, detail: 'no video, images or caption' });
  });
}
