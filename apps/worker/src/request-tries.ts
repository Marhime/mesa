// What one request may spend across its tries and models. An answer the model wrote is paid for, even when
// it can't be read; a busy, rate-limited or failed call (no answer) is not, and keeps following the retry
// rules (gemini.ts). One request makes at most 3 paid tries, and tries again at most once after an answer
// it couldn't read: the same request seldom reads better a third time.
import { ModelOutputError } from './model-output';

export const MAX_PAID_TRIES = 3;
export const MAX_UNREADABLE_RETRIES = 1;

export class RequestTries {
  private paid = 0;
  private unreadableRetries = 0;

  /** The model answered: that try was paid for. */
  answered(): void {
    this.paid += 1;
  }

  /** No paid try left: neither this model nor the next one is asked again. */
  get spent(): boolean {
    return this.paid >= MAX_PAID_TRIES;
  }

  /** Whether this failure may be tried again; saying yes to an unreadable answer uses up its one retry. */
  mayRetry(err: unknown): boolean {
    if (this.spent) return false;
    if (!(err instanceof ModelOutputError)) return true;
    if (this.unreadableRetries >= MAX_UNREADABLE_RETRIES) return false;
    this.unreadableRetries += 1;
    return true;
  }
}
