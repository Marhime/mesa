// import_jobs as the worker writes it: claiming the next job of a lane, and ending a run (done, failed,
// back in the queue). Every end clears the answer's words so far (draft), and is fenced: it lands only
// while the job is still this run's (processing, same attempt). A run the queue gave up on (10 minutes
// in "processing") and handed out again changes nothing: the newer run owns the job.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJob, ImportPlatform } from '@mesa/shared';
import type { ErrorCode } from './errors';
import type { Logger } from './log';
import { sleep } from './retry';

/** 'quick': only a person's quick kinds (ask, reread). 'any': everything, people's quick kinds first. */
export type Lane = 'any' | 'quick';

export async function claimJob(db: Pick<SupabaseClient, 'rpc'>, lane: Lane = 'any'): Promise<ImportJob | null> {
  const { data, error } = await db.rpc('claim_import_job', { p_lane: lane });
  if (error) throw new Error(`claim_import_job: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as ImportJob[];
  return rows[0] ?? null;
}

/** What a finished run leaves on the job besides its status. */
export interface DoneColumns {
  recipe_id?: string;
  already_saved?: boolean;
  proposal_id?: string;
  /** An asked job's answer (JobResults). */
  result?: unknown;
}

/** One job's ends, logged on the job's own lines. Each is false when it did not land (moved on, or gave up). */
export interface JobEnds {
  done(platform: ImportPlatform, columns: DoneColumns): Promise<boolean>;
  failed(platform: ImportPlatform, code: ErrorCode, error: string): Promise<boolean>;
  /** Back in the queue as if never claimed (shutdown). */
  requeue(): Promise<boolean>;
  /** False when the person cancelled (the app deletes the job). */
  stillAsked(): Promise<boolean>;
}

/** The run a job's ends belong to: the job as it was claimed. */
export type ClaimedJob = Pick<ImportJob, 'id' | 'attempts'>;

export interface JobStore {
  forJob(job: ClaimedJob, log: Logger): JobEnds;
}

const MAX_ERROR_CHARS = 300;
const finishedAt = (): string => new Date().toISOString();

export function jobStore(db: SupabaseClient): JobStore {
  return {
    forJob(job, log) {
      /**
       * A few tries: a job left in "processing" would be handed out again in 10 minutes and could run twice.
       * No row matched: another run holds the job now (no retry, nothing to do).
       */
      const update = async (patch: Record<string, unknown>): Promise<boolean> => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const { data, error } = await db
            .from('import_jobs')
            .update({ ...patch, draft: null })
            .eq('id', job.id)
            .eq('status', 'processing')
            .eq('attempts', job.attempts)
            .select('id');
          if (!error) {
            if (Array.isArray(data) && data.length > 0) return true;
            log.warn('job_moved_on', { status: patch.status, attempt: job.attempts });
            return false;
          }
          log.warn('job_update_failed', { attempt, status: patch.status, err: error.message });
          if (attempt < 3) await sleep(attempt * 2000);
        }
        log.error('job_update_gave_up', { status: patch.status });
        return false;
      };
      return {
        done: (platform, columns) => update({ status: 'done', ...columns, error: null, finished_at: finishedAt(), platform }),
        failed: (platform, code, error) =>
          update({ status: 'failed', error: error.slice(0, MAX_ERROR_CHARS), error_code: code, finished_at: finishedAt(), platform }),
        requeue: () => update({ status: 'queued', started_at: null, stage: null }),
        async stillAsked() {
          const { data, error } = await db.from('import_jobs').select('id').eq('id', job.id).maybeSingle();
          return !error && data !== null;
        },
      };
    },
  };
}
