// A job's ends land only for the run that holds the job: processing, same attempt. A run the queue gave up
// on and handed out again changes nothing, says so once, and tells nobody.
import { describe, expect, it, vi } from 'vitest';

import { jobStore } from '../src/job-store';
import type { LogFields, Logger } from '../src/log';
import { processJob } from '../src/runner';
import { fakeDb, fakeDeps, fakeJob, FakeDbError, jobUpdate, type Call } from './fake-deps';

function recordingLog() {
  const events: Array<{ msg: string; fields?: LogFields }> = [];
  const push = (msg: string, fields?: LogFields): void => void events.push({ msg, fields });
  const logger: Logger = { debug: push, info: push, warn: push, error: push, child: () => logger };
  return { logger, names: () => events.map((e) => e.msg) };
}

const jobEnd = (calls: Call[]) => calls.find((c) => c.table === 'import_jobs' && c.op === 'update')!;

describe('job ends', () => {
  it('update only the run that holds the job, and say whether a row matched', async () => {
    const { db, calls } = fakeDb(() => [{ id: 'job-1' }]);
    const ends = jobStore(db).forJob({ id: 'job-1', attempts: 3 }, recordingLog().logger);
    expect(await ends.done('web', { recipe_id: 'r1' })).toBe(true);
    expect(jobEnd(calls).filters).toEqual([
      ['eq', 'id', 'job-1'],
      ['eq', 'status', 'processing'],
      ['eq', 'attempts', 3],
      ['select', 'id'],
    ]);
    expect(jobEnd(calls).payload).toMatchObject({ status: 'done', recipe_id: 'r1', draft: null });
  });

  it('change nothing once the job moved on, without trying again', async () => {
    const { db, calls } = fakeDb(() => []);
    const log = recordingLog();
    const ends = jobStore(db).forJob({ id: 'job-1', attempts: 1 }, log.logger);
    expect(await ends.failed('web', 'pageFailed', 'nope')).toBe(false);
    expect(await ends.requeue()).toBe(false);
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(2);
    expect(log.names()).toEqual(['job_moved_on', 'job_moved_on']);
  });

  it('try a failed write again, then give up', async () => {
    vi.useFakeTimers();
    try {
      const { db, calls } = fakeDb(() => new FakeDbError('08006', 'connection reset'));
      const log = recordingLog();
      const result = jobStore(db).forJob({ id: 'job-1', attempts: 1 }, log.logger).done('web', {});
      await vi.runAllTimersAsync();
      expect(await result).toBe(false);
      expect(calls).toHaveLength(3);
      expect(log.names()).toEqual(['job_update_failed', 'job_update_failed', 'job_update_failed', 'job_update_gave_up']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a run whose job moved on', () => {
  it('sends no push: the run that holds the job tells', async () => {
    const { db, calls } = fakeDb((c) => (c.table === 'import_jobs' && c.op === 'update' ? [] : c.table === 'push_tokens' ? [{ token: 'ExponentPushToken[1]' }] : null));
    const d = fakeDeps(db, async () => ({}));
    // A sweep without media fails, and a failed sweep is always told.
    await processJob(d, fakeJob({ kind: 'sweep', attempts: 1 }), recordingLog().logger, { shutdown: new AbortController().signal });
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error_code: 'nothingToImport' });
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(false);

    // The same run, still holding its job, tells.
    const held = fakeDb((c) => (c.table === 'push_tokens' ? [] : null));
    await processJob(fakeDeps(held.db, async () => ({})), fakeJob({ kind: 'sweep', attempts: 1 }), recordingLog().logger, { shutdown: new AbortController().signal });
    expect(held.calls.some((c) => c.table === 'push_tokens')).toBe(true);
  });
});
