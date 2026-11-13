// Jobs a person asks for in the app and waits on (ideas, a translation, a creator's videos, a search, a
// week's plan, a question, ingredients read again): the answer goes in import_jobs.result; a push only
// when they asked, waited long and did not cancel.
import type { ImportJob, ImportPlatform } from '@mesa/shared';
import { askedReadyPush, type AskedKind, type AskedResult } from '../ready-pushes';
import type { JobHandler, JobRun } from './types';

export function askedHandler<K extends AskedKind>(
  kind: K,
  run: (r: JobRun) => Promise<AskedResult<K>>,
  platform: (job: ImportJob) => ImportPlatform = () => 'text',
): JobHandler {
  return {
    platform,
    tellFailure: 'if_asked',
    async run(r) {
      const result = await run(r);
      return {
        columns: result === null ? {} : { result },
        ready: { push: askedReadyPush(kind, r.job.id, result, r.job.subject_id ?? null), tell: 'if_asked' },
      };
    },
  };
}
