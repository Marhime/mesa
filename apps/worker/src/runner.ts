// One job from claim to end: its kind's handler runs it under a timeout (handlers/index.ts); the job is
// marked done, or failed with the code its kind's registry entry says (@mesa/shared JOB_KINDS), or put back
// in the queue when the worker shuts down (every kind, background work too); and the person is told when it
// is worth it (notify.ts). A kind without a handler fails at once with unknownKind: nothing is read, no
// model is called.
import { isImportKind, jobKind, type ImportJob, type ImportKind } from '@mesa/shared';
import { errorCodeFor, errorMessage, isImportError, MESSAGES, type ErrorCode, type ImportError } from './errors';
import { buildHandlers, type Handlers } from './handlers';
import { jobStore, type JobStore } from './job-store';
import type { Logger } from './log';
import { notifier, type Notifier } from './notify';
import type { PipelineDeps } from './pipeline-common';
import { jobProgress, type Progress } from './progress';
import { failurePush, sendPush } from './push';

/** Must stay below the 10 minutes after which claim_import_job hands a "processing" job out again. */
export const JOB_TIMEOUT_MS = 8 * 60 * 1000;

export interface Runner {
  handlers: Handlers;
  store: JobStore;
  notify: Notifier;
  progress(jobId: string, log: Logger): Progress;
}

export interface ProcessOptions {
  /** Aborted when the worker shuts down: the job is put back in the queue instead of failing. */
  shutdown: AbortSignal;
}

/** Everything a job needs, wired once from the worker's dependencies (index.ts). */
export function jobRunner(deps: PipelineDeps): Runner {
  return {
    handlers: buildHandlers(deps),
    store: jobStore(deps.db),
    notify: notifier((target, content, log) => sendPush(deps.db, target, content, log, deps.config.expoAccessToken)),
    progress: (jobId, log) => jobProgress(deps.db, jobId, log),
  };
}

/** Codes every kind keeps as raised: the way out is the same whatever was asked (in a few minutes, tomorrow). */
const ALWAYS_KEPT: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['aiBusy', 'aiDailyLimit']);

/**
 * The code a failed run is stored with: what it raised when the kind keeps it (ALWAYS_KEPT always), else
 * the kind's own failure. A run that took too long raised `timeout`.
 */
export function failureCode(kind: ImportKind, err: unknown, timedOut: boolean): ErrorCode {
  const raised: ErrorCode = timedOut ? 'timeout' : errorCodeFor(err);
  const { keeps, failure } = jobKind(kind);
  return keeps === 'every' || ALWAYS_KEPT.has(raised) || keeps.includes(raised) ? raised : failure;
}

const inputOf = (job: ImportJob): string => (job.input_image_path ? 'media' : job.input_url ? 'url' : 'text');

export async function runJob(rn: Runner, job: ImportJob, baseLog: Logger, opts: ProcessOptions): Promise<void> {
  const log = baseLog.child({ job: job.id, household: job.household_id });
  const ends = rn.store.forJob(job, log);
  const started = Date.now();
  const kind: unknown = job.kind;
  if (!isImportKind(kind)) {
    log.error('job_kind_unknown', { kind });
    await ends.failed('text', 'unknownKind', MESSAGES.unknownKind);
    return;
  }
  const handler = rn.handlers[kind];
  const timeout = AbortSignal.timeout(JOB_TIMEOUT_MS);
  const signal = AbortSignal.any([opts.shutdown, timeout]);
  const progress = rn.progress(job.id, log);
  const platform = handler.platform(job);
  log.info('job_started', { kind, platform, attempt: job.attempts, input: inputOf(job) });

  try {
    const done = await handler.run({ job, log, signal, progress });
    await progress.flush();
    const finalPlatform = done.platform ?? platform;
    // Not landed: the run that holds the job now ends it, and tells.
    if (!(await ends.done(finalPlatform, done.columns ?? {}))) return;
    log.info('job_done', { kind, platform: finalPlatform, ...done.logged, ms: Date.now() - started });
    if (done.ready) await rn.notify.tell(job, ends, done.ready.push, done.ready.tell, log);
  } catch (err) {
    await progress.flush();
    const ms = Date.now() - started;
    if (opts.shutdown.aborted && !timeout.aborted) {
      log.warn('job_requeued_on_shutdown', { kind, ms });
      await ends.requeue();
      return;
    }
    const code = failureCode(kind, err, timeout.aborted);
    const fields = { kind, platform, code, detail: errorMessage(err), ms };
    if (isImportError(err) || timeout.aborted) log.warn('job_failed', { ...fields, cause: (err as ImportError).cause });
    else log.error('job_failed_unexpected', { ...fields, err, stack: err instanceof Error ? err.stack : undefined });
    // Nobody reads a background job's error: it keeps the detail for whoever looks at the table.
    const error = jobKind(kind).lane === 'background' ? errorMessage(err) : MESSAGES[code];
    if (!(await ends.failed(platform, code, error))) return;
    await rn.notify.tell(job, ends, failurePush(kind, job.id, MESSAGES[code]), handler.tellFailure, log);
  }
}

/** One job with the runner wired from `deps` (tests; the worker wires its runner once). */
export const processJob = (deps: PipelineDeps, job: ImportJob, log: Logger, opts: ProcessOptions): Promise<void> =>
  runJob(jobRunner(deps), job, log, opts);
