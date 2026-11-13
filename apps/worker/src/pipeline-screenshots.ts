// Several screenshots of one recipe (a long post, a page scrolled through): all of them go to the model in
// one extraction call, in order, while their total stays under what one request can carry.
import type { ImportJob } from '@mesa/shared';

import { ImportError } from './errors';
import { isModelImage, sniffImage } from './http';
import type { ModelPart } from './model-port';
import type { ImageSource } from './images';
import { inlinePart, MAX_INLINE_IMAGE_BYTES, requireRecipe, textPart, type Ctx, type ImportResult } from './pipeline-common';
import { sourcePrompt } from './prompts';

/** As many as the database lets a job carry (import_jobs_image_paths). */
const MAX_SCREENSHOTS = 6;

export interface Screenshot {
  path: string;
  bytes: Buffer;
  mime: string;
}

/** Every image of a job, in order, without repeats: input_image_paths, else input_image_path alone. */
export function jobImagePaths(job: Pick<ImportJob, 'input_image_path' | 'input_image_paths'>): string[] {
  const many = (job.input_image_paths ?? []).filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  if (many.length > 0) return [...new Set(many)];
  return job.input_image_path ? [job.input_image_path] : [];
}

export interface ScreenshotBatch {
  parts: ModelPart[];
  /** The screenshots sent, in order: a prefix of those given. */
  sent: Screenshot[];
  bytes: number;
}

/**
 * The parts of one extraction call: the screenshots in order, each labelled with its place, while their
 * total stays under maxBytes (the first one that would pass it, and every one after, is left out).
 */
export function screenshotParts(shots: readonly Screenshot[], maxBytes: number = MAX_INLINE_IMAGE_BYTES): ScreenshotBatch {
  const sent: Screenshot[] = [];
  let bytes = 0;
  for (const shot of shots) {
    if (bytes + shot.bytes.length > maxBytes) break;
    sent.push(shot);
    bytes += shot.bytes.length;
  }
  const n = sent.length;
  const parts: ModelPart[] = [
    textPart(
      n === 1
        ? 'This is a screenshot of a recipe.'
        : `These are ${n} screenshots of the same recipe, in order (1 to ${n}). Read them together as one recipe: ingredients and steps may continue from one screenshot to the next.`,
    ),
  ];
  sent.forEach((shot, i) => parts.push(textPart(`Screenshot ${i + 1} of ${n}:`), inlinePart(shot.bytes, shot.mime)));
  parts.push(
    textPart(
      `${sourcePrompt({ kind: n === 1 ? 'screenshot or photo' : `${n} screenshots of one recipe` })}\nimage_shows_dish: true only when screenshot 1 shows the prepared dish.`,
    ),
  );
  return { parts, sent, bytes };
}

/** A screenshot from storage (job-media.ts), or why it can't be read. */
async function loadScreenshot(ctx: Ctx, path: string): Promise<Screenshot | ImportError> {
  try {
    const bytes = await ctx.deps.media.read(ctx.job.household_id, path);
    const type = sniffImage(bytes);
    const detected = type?.mime ?? 'unknown bytes';
    if (!isModelImage(type)) return new ImportError('imageUnsupported', { detail: detected });
    return { path, bytes, mime: type.mime };
  } catch (err) {
    if (err instanceof ImportError) return err;
    return new ImportError('imageMissing', { cause: err, detail: 'download failed' });
  }
}

/** One recipe from several screenshots; one that can't be read is skipped, the others still count. */
export async function fromScreenshots(ctx: Ctx, paths: readonly string[]): Promise<ImportResult> {
  const loaded = await Promise.all(paths.slice(0, MAX_SCREENSHOTS).map((p) => loadScreenshot(ctx, p)));
  if (ctx.signal.aborted) throw ctx.signal.reason;
  const shots = loaded.filter((s): s is Screenshot => !(s instanceof ImportError));
  const skipped = loaded.filter((s): s is ImportError => s instanceof ImportError);
  if (skipped.length > 0) ctx.log.warn('screenshots_skipped', { skipped: skipped.map((e) => e.message) });
  if (shots.length === 0) throw skipped[0] ?? new ImportError('imageMissing', { detail: 'no screenshot' });

  const batch = screenshotParts(shots);
  if (batch.sent.length === 0) throw new ImportError('imageTooLarge', { detail: `${shots[0]!.bytes.length} bytes` });
  ctx.log.info('screenshots', { given: paths.length, read: shots.length, sent: batch.sent.length, bytes: batch.bytes });

  ctx.progress.stage('reading');
  const outcome = await ctx.deps.ai.extractRecipe(batch.parts, ctx.known(), ctx.signal);
  const recipe = requireRecipe(outcome, null);
  // The first screenshot becomes the picture only when it shows the dish: a copy of its bytes (pipeline.ts).
  const showsDish = outcome.kind === 'recipe' && outcome.imageShowsDish === true;
  const image: ImageSource | null = showsDish ? { kind: 'bytes', bytes: batch.sent[0]!.bytes } : null;
  return { recipe, platform: 'image', sourceUrl: null, image };
}
