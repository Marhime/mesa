// Recipe imports: a job an earlier run already wrote finishes with that recipe, and a link the household
// already saved points at that recipe; otherwise the recipe is read (pipeline.ts), its image stored and the
// recipe written, and the person told when the wait was long. A single shared photo that is not a recipe
// may be a receipt (Ticket In through "Save to Mesa").
import type { ExtractedRecipe, ImportJob, ImportPlatform } from '@mesa/shared';
import { isImportError } from '../errors';
import type { RecipeImages } from '../images';
import type { Logger } from '../log';
import type { ImportResult } from '../pipeline-common';
import { jobImagePaths } from '../pipeline-screenshots';
import { readyPush } from '../push';
import type { SavedRecipes } from '../repos/recipes';
import type { RecipeMeta, WriteResult } from '../writer';
import { scanDone, type ReadScan } from './scan';
import type { Done, JobHandler, JobRun } from './types';

/** What the recipe handler needs, and nothing else. */
export interface RecipePorts {
  /** The job's link as recipes.source_url stores it; null for images and text. */
  sourceUrl(job: ImportJob): string | null;
  platform(job: ImportJob): ImportPlatform;
  saved: SavedRecipes;
  read(r: JobRun): Promise<ImportResult>;
  images: RecipeImages;
  write(recipe: ExtractedRecipe, meta: RecipeMeta, log: Logger): Promise<WriteResult>;
  readReceipt: ReadScan;
}

/** A shared photo that isn't a recipe may be a receipt; several screenshots are always meant as one recipe. */
const mayBeReceipt = (r: JobRun, err: unknown): boolean =>
  Boolean(r.job.input_image_path) && jobImagePaths(r.job).length <= 1 && !r.signal.aborted && isImportError(err) && err.code === 'notRecipe';

async function importRecipe(p: RecipePorts, r: JobRun): Promise<Done> {
  const { job, log, signal } = r;
  // A run that wrote the recipe but never marked the job done (a crash, a lost connection): nothing to read.
  const written = await p.saved.byJob(job.household_id, job.id);
  if (written) return { columns: { recipe_id: written }, logged: { recipe: written, written_before: true } };

  const url = p.sourceUrl(job);
  const existing = url ? await p.saved.byUrl(job.household_id, url) : null;
  if (existing) return { columns: { recipe_id: existing, already_saved: true }, logged: { recipe: existing, already_saved: true } };

  const result = await p.read(r);
  r.progress.stage('writing');
  const image = await p.images.store(job.household_id, result.image, log, signal);
  let saved: WriteResult;
  try {
    if (signal.aborted) throw signal.reason;
    saved = await p.write(
      result.recipe,
      {
        householdId: job.household_id,
        jobId: job.id,
        attempt: job.attempts,
        sourceUrl: result.sourceUrl,
        platform: result.platform,
        imagePath: image.path,
        author: result.author ?? null,
      },
      log,
    );
  } catch (err) {
    await image.discard();
    throw err;
  }
  return {
    columns: { recipe_id: saved.recipeId },
    platform: result.platform,
    logged: {
      recipe: saved.recipeId,
      title: result.recipe.title,
      ingredients: saved.ingredients,
      matched: saved.matched,
      new_products: saved.createdProducts,
      steps: result.recipe.steps.length,
      image: image.path !== null,
      author: result.author?.name ?? null,
      waited_ms: Date.now() - Date.parse(job.created_at),
    },
    ready: { push: readyPush(saved.recipeId, result.recipe.title), tell: 'after_wait' },
  };
}

export function recipeHandler(p: RecipePorts): JobHandler {
  return {
    platform: p.platform,
    tellFailure: 'always',
    async run(r) {
      try {
        return await importRecipe(p, r);
      } catch (err) {
        if (!mayBeReceipt(r, err)) throw err;
        const scan = await p.readReceipt(r, 'receipt').catch((receiptErr: unknown) => {
          r.log.info('not_a_receipt_either', { err: receiptErr });
          return null;
        });
        if (!scan) throw err;
        return scanDone(scan);
      }
    },
  };
}
