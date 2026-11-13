// When the person hears about a job, and to whom it goes: the phones of import_jobs.created_by, or the
// whole household for rows from before created_by (push.ts sends it).
import type { ImportJob } from '@mesa/shared';
import type { JobEnds } from './job-store';
import type { Logger } from './log';
import type { PushContent, PushTarget } from './push';

/** Below this, the person is most likely still looking at the app: the in-app card is enough. */
export const READY_PUSH_AFTER_MS = 15_000;

/**
 * always: a scan's proposal, a failed import. after_wait: an imported recipe, after a long wait.
 * if_asked: an asked job, when someone asked (the server's own jobs have no created_by), waited long and
 * did not cancel. never: background work.
 */
export type Tell = 'always' | 'after_wait' | 'if_asked' | 'never';

export type Send = (target: PushTarget, content: PushContent, log: Logger) => Promise<void>;

export interface Notifier {
  tell(job: ImportJob, ends: Pick<JobEnds, 'stillAsked'>, content: PushContent, when: Tell, log: Logger): Promise<void>;
}

const waitedLong = (job: ImportJob): boolean => Date.now() - Date.parse(job.created_at) >= READY_PUSH_AFTER_MS;

export function notifier(send: Send): Notifier {
  const worthIt = async (job: ImportJob, ends: Pick<JobEnds, 'stillAsked'>, when: Tell): Promise<boolean> => {
    switch (when) {
      case 'always':
        return true;
      case 'after_wait':
        return waitedLong(job);
      case 'if_asked':
        return Boolean(job.created_by) && waitedLong(job) && (await ends.stillAsked());
      case 'never':
        return false;
    }
  };
  return {
    async tell(job, ends, content, when, log) {
      if (await worthIt(job, ends, when)) await send({ householdId: job.household_id, userId: job.created_by ?? null }, content, log);
    },
  };
}
