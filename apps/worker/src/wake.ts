// Instant wake: a slot with nothing to do waits for the next poll, or less when a new job comes in (a
// Realtime INSERT on import_jobs, which is in the supabase_realtime publication). Best effort: the poll
// stays the fallback, so a channel that fails or closes is only logged (supabase-js rejoins it) and never
// stops or slows the loop. Realtime uses Node's own WebSocket (Node 22+, see apps/worker/Dockerfile).
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './log';

export type WaitEnd = 'woken' | 'timeout' | 'stopped';

/** Wakes the slots waiting for work. */
export class WakeBell {
  private rung = 0;
  private readonly waiting = new Set<() => void>();

  /** Rings so far: take one before a claim, so a ring during the claim still ends the wait after it. */
  ticket(): number {
    return this.rung;
  }

  ring(): void {
    this.rung++;
    for (const wake of [...this.waiting]) wake();
  }

  /** Waits `ms`, less when the bell rings (or rang since `since`), or until `signal` aborts. Never rejects. */
  wait(ms: number, signal: AbortSignal, since = this.rung): Promise<WaitEnd> {
    if (signal.aborted) return Promise.resolve('stopped');
    if (this.rung > since) return Promise.resolve('woken');
    return new Promise((resolve) => {
      const end = (how: WaitEnd): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        this.waiting.delete(onRing);
        resolve(how);
      };
      const onRing = (): void => end('woken');
      const onAbort = (): void => end('stopped');
      const timer = setTimeout(() => end('timeout'), ms);
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiting.add(onRing);
    });
  }
}

/** The part of supabase-js that hears new jobs (a fake in tests). */
export type RealtimeDb = Pick<SupabaseClient, 'channel' | 'removeChannel'>;

export interface NewJobs {
  close(): Promise<void>;
}

/** A channel the server closed is opened again after this; errors and timeouts are rejoined by supabase-js. */
const REOPEN_MS = 30_000;
const CLOSE_WAIT_MS = 2_000;

/** Calls onJob for every new import job. Never throws: trouble is logged and the poll carries on. */
export function listenForNewJobs(db: RealtimeDb, onJob: () => void, log: Logger, reopenMs = REOPEN_MS): NewJobs {
  let current: RealtimeChannel | null = null;
  let opened = 0;
  let reopen: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastStatus: string | null = null;

  const drop = (channel: RealtimeChannel): Promise<void> =>
    Promise.resolve()
      .then(() => db.removeChannel(channel))
      .then(() => undefined, () => undefined);

  const open = (): void => {
    reopen = null;
    if (closed) return;
    try {
      // A new name each time: supabase-js hands back an existing channel of the same name.
      const channel = db.channel(`worker-new-jobs-${++opened}`);
      current = channel;
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'import_jobs' }, () => onJob())
        .subscribe((status, err) => {
          if (closed || channel !== current) return;
          const state = String(status);
          if (state !== lastStatus) {
            if (state === 'SUBSCRIBED') log.info('wake_listening');
            else log.warn('wake_channel_trouble', { status: state, err, note: 'new jobs wait for the poll meanwhile' });
            lastStatus = state;
          }
          if (state === 'CLOSED') {
            current = null;
            void drop(channel);
            reopen = setTimeout(open, reopenMs);
          }
        });
    } catch (err) {
      // No WebSocket in this runtime, or a client that cannot connect: polling only.
      current = null;
      log.error('wake_unavailable', { err, note: 'new jobs are picked up by the poll only' });
    }
  };

  open();
  return {
    async close() {
      closed = true;
      if (reopen) clearTimeout(reopen);
      const channel = current;
      current = null;
      if (!channel) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, CLOSE_WAIT_MS);
        void drop(channel).then(() => {
          clearTimeout(t);
          resolve();
        });
      });
    },
  };
}
