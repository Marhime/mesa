// Claim → import → write → mark done/failed (+ push on failure).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJob, ImportPlatform } from '@mesa/shared';
import { errorMessage, ImportError, isImportError, MESSAGES, userMessageFor } from './errors';
import { sleep } from './retry';
import { RECIPE_IMAGES_BUCKET, storeRecipeImage } from './images';
import type { Logger } from './log';
import { jobPlatform, runImport, type PipelineDeps } from './pipeline';
import { sendFailurePush, sendPush } from './push';
import { runScan, type ScanResult } from './scan';
import { writeRecipe } from './writer';

/** Must stay below the 10 minutes after which claim_import_job hands a "processing" job out again. */
export const JOB_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_ERROR_CHARS = 300;

export async function claimJob(db: SupabaseClient): Promise<ImportJob | null> {
  const { data, error } = await db.rpc('claim_import_job');
  if (error) throw new Error(`claim_import_job: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as ImportJob[];
  return rows[0] ?? null;
}

type JobUpdate =
  | { status: 'done'; recipe_id: string; error: null; finished_at: string; platform: ImportPlatform }
  | { status: 'done'; proposal_id: string; error: null; finished_at: string; platform: ImportPlatform }
  | { status: 'failed'; error: string; finished_at: string; platform: ImportPlatform }
  | { status: 'queued'; started_at: null };

/** A few tries: a job left in "processing" would be retried in 10 minutes and could import twice. */
async function updateJob(db: SupabaseClient, jobId: string, update: JobUpdate, log: Logger): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await db.from('import_jobs').update(update).eq('id', jobId);
    if (!error) return true;
    log.warn('job_update_failed', { attempt, status: update.status, err: error.message });
    if (attempt < 3) await sleep(attempt * 2000);
  }
  log.error('job_update_gave_up', { status: update.status });
  return false;
}

export interface ProcessOptions {
  /** Aborted when the worker shuts down: the job is put back in the queue instead of failing. */
  shutdown: AbortSignal;
}

/** A recipe import: extract, store the image, write the recipe. */
async function importRecipe(deps: PipelineDeps, job: ImportJob, log: Logger, signal: AbortSignal, started: number): Promise<ImportPlatform> {
  const result = await runImport(deps, job, log, signal);
  const platform = result.platform;
  const imagePath = await storeRecipeImage(deps.db, job.household_id, result.image, log, signal);
  const uploadedHere = imagePath !== null && result.image?.kind !== 'path';
  let written;
  try {
    if (signal.aborted) throw signal.reason;
    written = await writeRecipe(deps.db, deps.catalog, result.recipe, {
      householdId: job.household_id,
      sourceUrl: result.sourceUrl,
      platform,
      imagePath,
    }, log);
  } catch (err) {
    if (uploadedHere) await deps.db.storage.from(RECIPE_IMAGES_BUCKET).remove([imagePath]).catch(() => undefined);
    throw err;
  }
  await updateJob(deps.db, job.id, { status: 'done', recipe_id: written.recipeId, error: null, finished_at: new Date().toISOString(), platform }, log);
  log.info('job_done', {
    platform,
    recipe: written.recipeId,
    title: result.recipe.title,
    ingredients: written.ingredients,
    matched: written.matched,
    new_products: written.createdProducts,
    steps: result.recipe.steps.length,
    image: imagePath !== null,
    ms: Date.now() - started,
  });
  return platform;
}

/** A sweep or receipt: the proposal is written; the household gets a push to review it. */
async function finishScan(deps: PipelineDeps, job: ImportJob, scan: ScanResult, log: Logger, started: number): Promise<void> {
  await updateJob(
    deps.db,
    job.id,
    { status: 'done', proposal_id: scan.proposalId, error: null, finished_at: new Date().toISOString(), platform: scan.platform },
    log,
  );
  log.info('job_done', { kind: scan.kind, proposal: scan.proposalId, changes: scan.changes, ms: Date.now() - started });
  await sendPush(deps.db, job.household_id, scan.push, log, deps.config.expoAccessToken);
}

export async function processJob(deps: PipelineDeps, job: ImportJob, baseLog: Logger, opts: ProcessOptions): Promise<void> {
  const log = baseLog.child({ job: job.id, household: job.household_id });
  const started = Date.now();
  const timeout = AbortSignal.timeout(JOB_TIMEOUT_MS);
  const signal = AbortSignal.any([opts.shutdown, timeout]);
  const kind = job.kind ?? 'recipe';
  let platform: ImportPlatform = kind === 'recipe' ? jobPlatform(job) : 'image';
  log.info('job_started', {
    kind,
    platform,
    attempt: job.attempts,
    input: job.input_image_path ? 'media' : job.input_url ? 'url' : 'text',
  });

  try {
    if (kind === 'sweep' || kind === 'receipt') {
      await finishScan(deps, job, await runScan(deps, job, kind, log, signal), log, started);
      return;
    }
    try {
      platform = await importRecipe(deps, job, log, signal, started);
    } catch (err) {
      // A shared photo that isn't a recipe may be a receipt (Ticket In through "Save to Mesa").
      if (!job.input_image_path || signal.aborted || !isImportError(err) || err.userMessage !== MESSAGES.notRecipe) throw err;
      const scan = await runScan(deps, job, 'receipt', log, signal).catch((receiptErr: unknown) => {
        log.info('not_a_receipt_either', { err: receiptErr });
        return null;
      });
      if (!scan) throw err;
      await finishScan(deps, job, scan, log, started);
    }
  } catch (err) {
    if (opts.shutdown.aborted && !timeout.aborted) {
      log.warn('job_requeued_on_shutdown', { ms: Date.now() - started });
      await updateJob(deps.db, job.id, { status: 'queued', started_at: null }, log);
      return;
    }
    const message = (timeout.aborted ? MESSAGES.timeout : userMessageFor(err)).slice(0, MAX_ERROR_CHARS);
    if (isImportError(err) || timeout.aborted) {
      log.warn('job_failed', { platform, error: message, detail: errorMessage(err), cause: (err as ImportError).cause, ms: Date.now() - started });
    } else {
      log.error('job_failed_unexpected', { platform, error: message, err, stack: err instanceof Error ? err.stack : undefined, ms: Date.now() - started });
    }
    await updateJob(deps.db, job.id, { status: 'failed', error: message, finished_at: new Date().toISOString(), platform }, log);
    await sendFailurePush(deps.db, job.household_id, job.id, log, deps.config.expoAccessToken);
  }
}
