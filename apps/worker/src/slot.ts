// One worker slot: claim a job from its lane, run it, and when the queue is empty wait for the next poll
// or an earlier wake (a new job). After a job that asks for it (pauseAfter: the server's own work) the
// slot rests before claiming again, unless a new job came in meanwhile. A failing claim backs off;
// shutdown ends the loop between jobs.
import type { ImportJob } from '@mesa/shared';
import type { Logger } from './log';
import { sleep } from './retry';
import type { WakeBell } from './wake';

const MAX_CLAIM_BACKOFF_MS = 60_000;

export interface SlotDeps {
  /** The next job of this slot's lane, or null when there is none. */
  claim: () => Promise<ImportJob | null>;
  run: (job: ImportJob) => Promise<void>;
  bell: Pick<WakeBell, 'ticket' | 'wait'>;
  pollMs: number;
  /** Aborted on shutdown: no new claims. */
  stopping: AbortSignal;
  log: Logger;
  /** After each claim that reached the queue (the healthcheck). */
  onClaimed?: () => void;
  /** How long to rest after this job (ms); a new job ends the rest at once. */
  pauseAfter?: (job: ImportJob) => number;
}

export async function runSlot(d: SlotDeps): Promise<void> {
  let backoff = d.pollMs;
  while (!d.stopping.aborted) {
    const ticket = d.bell.ticket();
    let job: ImportJob | null;
    try {
      job = await d.claim();
      backoff = d.pollMs;
      d.onClaimed?.();
    } catch (err) {
      // The queue is not answering: waking early would only knock again.
      d.log.error('claim_failed', { err, retry_ms: backoff });
      await sleep(backoff, d.stopping).catch(() => undefined);
      backoff = Math.min(backoff * 2, MAX_CLAIM_BACKOFF_MS);
      continue;
    }
    if (!job) {
      await d.bell.wait(d.pollMs, d.stopping, ticket);
      continue;
    }
    try {
      await d.run(job);
    } catch (err) {
      d.log.error('process_crashed', { job: job.id, err, stack: err instanceof Error ? err.stack : undefined });
    }
    // The ticket predates the run: a job that came in while it ran ends the rest at once.
    const pause = d.pauseAfter?.(job) ?? 0;
    if (pause > 0) await d.bell.wait(pause, d.stopping, ticket);
  }
}
