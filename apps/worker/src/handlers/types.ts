// The contract between the runner and the handler of each kind of job (handlers/index.ts lists them).
import type { ImportJob, ImportKind, ImportPlatform } from '@mesa/shared';
import type { DoneColumns } from '../job-store';
import type { LogFields, Logger } from '../log';
import type { Tell } from '../notify';
import type { Progress } from '../progress';
import type { PushContent } from '../push';

/** One run of one job. */
export interface JobRun {
  job: ImportJob;
  log: Logger;
  /** Aborted on shutdown or when the job runs too long. */
  signal: AbortSignal;
  /** Stages and early preview shown in the app (best effort). */
  progress: Progress;
}

/** What a run that succeeded leaves on the job, logs and tells. */
export interface Done {
  columns?: DoneColumns;
  /** Learned while running (a link's platform, a scan's media); else the handler's platform(job). */
  platform?: ImportPlatform;
  /** Added to the job_done log line. */
  logged?: LogFields;
  /** The ready push, and when it is worth sending; none: nobody is told. */
  ready?: { push: PushContent; tell: Tell } | null;
}

export interface JobHandler {
  /** Stored on the job, known before it runs (also when it fails). */
  platform(job: ImportJob): ImportPlatform;
  run(run: JobRun): Promise<Done>;
  /** When the person hears that it failed. */
  tellFailure: Tell;
}

/** One handler per kind of the registry: a kind without one does not compile. */
export type Handlers = Record<ImportKind, JobHandler>;
