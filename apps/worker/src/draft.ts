// Words written while the model answers, in import_jobs.draft so the app can show them at once: at most
// one write every ~350 ms (the latest text wins), and one more as soon as the text is complete.
// Best effort: a failed write is logged and never fails or slows the job. Once the job is done or failed,
// `result` / `error` say the rest and the worker clears the draft (job-store.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './log';

export const DRAFT_EVERY_MS = 350;
/** The column's check constraint. */
const MAX_DRAFT = 4000;
/** close() waits this long at most for writes on the way: a later one changes nothing (see send). */
const CLOSE_WAIT_MS = 2000;

export interface Draft {
  /** The whole text so far, not a piece; '' clears it (a new try starts over). */
  write(text: string): void;
  /** Writes what is waiting now (the text is complete). */
  flush(): void;
  /** No more writes; resolves once those on the way have landed, or after a short wait. */
  close(): Promise<void>;
}

export function jobDraft(db: Pick<SupabaseClient, 'from'>, jobId: string, log: Logger, everyMs = DRAFT_EVERY_MS): Draft {
  let sent = ''; // the claim cleared the column
  let waiting: string | null = null;
  let lastAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let warned = false;
  let chain: Promise<void> = Promise.resolve();

  const stopTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const send = (): void => {
    stopTimer();
    const text = waiting;
    waiting = null;
    if (closed || text === null || text === sent) return;
    sent = text;
    lastAt = Date.now();
    // In order, each independent of the others' success.
    chain = chain.then(async () => {
      try {
        // Only while the job runs: a write landing after done / failed is ignored.
        const { error } = await db.from('import_jobs').update({ draft: text || null }).eq('id', jobId).eq('status', 'processing');
        if (error) throw new Error(error.message);
      } catch (err) {
        if (!warned) log.warn('draft_write_failed', { err });
        warned = true;
      }
    });
  };

  return {
    write(text) {
      if (closed) return;
      waiting = text.slice(0, MAX_DRAFT);
      if (timer) return;
      if (waiting === sent) {
        waiting = null;
        return;
      }
      const wait = lastAt + everyMs - Date.now();
      if (wait <= 0) send();
      else timer = setTimeout(send, wait);
    },
    flush: send,
    close() {
      closed = true;
      stopTimer();
      waiting = null;
      return new Promise<void>((resolve) => {
        const t = setTimeout(resolve, CLOSE_WAIT_MS);
        void chain.then(() => {
          clearTimeout(t);
          resolve();
        });
      });
    },
  };
}
