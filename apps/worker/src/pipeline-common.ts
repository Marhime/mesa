// What every import path shares: its dependencies, its context, and how a model answer becomes a recipe.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedRecipe, ImportJob, ImportPlatform } from '@mesa/shared';
import type { SourceAuthor } from './author';
import type { HouseholdCatalogs } from './catalog-store';
import type { Config } from './config';
import { ImportError, type ErrorCode } from './errors';
import type { ImageSource } from './images';
import type { SaidText } from './known-names';
import type { Logger } from './log';
import type { ImportDeps } from './ports';
import type { ModelPart, ModelPort } from './model-port';
import type { Catalog } from './mapping';
import type { ModelOutcome } from './model-output';
import type { Progress } from './progress';
import type { YtDlpOptions } from './ytdlp';

/** The worker's dependencies, wired once in index.ts; each job is given only its part of them (ports.ts). */
export interface PipelineDeps {
  config: Config;
  db: SupabaseClient;
  ai: ModelPort;
  catalog: HouseholdCatalogs;
}

export interface ImportResult {
  recipe: ExtractedRecipe;
  platform: ImportPlatform;
  sourceUrl: string | null;
  image: ImageSource | null;
  /** Who made it, when the source says (best effort). */
  author?: SourceAuthor | null;
}

export interface Ctx {
  deps: ImportDeps;
  job: ImportJob;
  log: Logger;
  signal: AbortSignal;
  /** Shared catalog + the household's products. */
  catalog: Catalog;
  /** Product names offered to the model for name_en: those the text names (knownNames). */
  known(text?: SaidText): string[];
  /** Stages and early preview shown in the app while the job runs. */
  progress: Progress;
}

export const MAX_INLINE_IMAGE_BYTES = 15 * 1024 * 1024;
export const MIN_CAPTION = 20;

/** Turns the model outcome into a recipe, or the failure the person should see. */
export function requireRecipe(
  outcome: ModelOutcome,
  fallbackTitle: string | null | undefined,
  emptyCode: ErrorCode = 'noIngredients',
): ExtractedRecipe {
  if (outcome.kind === 'not_recipe') throw new ImportError('notRecipe');
  const recipe = outcome.recipe;
  if (recipe.ingredients.length === 0) throw new ImportError(emptyCode, { detail: 'no ingredients' });
  if (recipe.title.trim() === '' && fallbackTitle) recipe.title = fallbackTitle.slice(0, 200);
  return recipe;
}

export const textPart = (text: string): ModelPart => ({ text });
export const inlinePart = (bytes: Buffer, mimeType: string): ModelPart => ({ inlineData: { mimeType, data: bytes.toString('base64') } });

export const ytOptions = (config: Config): YtDlpOptions => ({ path: config.ytdlpPath, cookies: config.ytdlpCookies });

export async function withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'mesa-import-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
