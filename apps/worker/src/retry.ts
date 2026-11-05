// Generic retry loop and an abortable sleep. What counts as retryable is decided by the caller.
import type { LogFields, Logger } from './log';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason as Error);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(signal!.reason as Error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface RetryOptions {
  signal?: AbortSignal;
  log: Logger;
  /** Names the call in the "retrying" log line. */
  what: string;
  /** Total tries, the first one included. */
  attempts: number;
  retryable: (err: unknown) => boolean;
  /** Wait after failed try number `attempt` (1-based). */
  delayMs: (err: unknown, attempt: number) => number;
  /** Extra fields for the "retrying" log line. */
  fields?: LogFields;
}

/** Runs fn up to `attempts` times, waiting between tries while the failure is retryable. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (opts.signal?.aborted || attempt >= opts.attempts || !opts.retryable(err)) throw err;
      const delay = opts.delayMs(err, attempt);
      opts.log.warn('retrying', { what: opts.what, ...opts.fields, attempt, delay_ms: delay, err });
      await sleep(delay, opts.signal);
    }
  }
}
