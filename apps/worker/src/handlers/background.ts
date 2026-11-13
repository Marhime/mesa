// Work the server queues and nobody waits for (tidying, the daily and weekly looks): no progress, no push;
// a failure leaves things as they were.
import type { ImportPlatform } from '@mesa/shared';
import type { LogFields } from '../log';
import type { JobHandler, JobRun } from './types';

export function backgroundHandler(run: (r: JobRun) => Promise<LogFields>, platform: ImportPlatform): JobHandler {
  return {
    platform: () => platform,
    tellFailure: 'never',
    run: async (r) => ({ logged: await run(r) }),
  };
}
