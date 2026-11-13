// Expected failures: an ImportError carries the code stored in import_jobs.error_code (MESSAGES and
// ErrorCode live in @mesa/shared, so the app reads the same list) and the sentence shown for it.
import { MESSAGES, type ErrorCode } from '@mesa/shared';

export { MESSAGES, type ErrorCode };

/** An expected failure, said to the person who asked in their own words (MESSAGES[code]). */
export class ImportError extends Error {
  readonly userMessage: string;

  constructor(
    readonly code: ErrorCode,
    options?: { cause?: unknown; detail?: string },
  ) {
    super(options?.detail ? `${MESSAGES[code]} (${options.detail})` : MESSAGES[code], { cause: options?.cause });
    this.name = 'ImportError';
    this.userMessage = MESSAGES[code];
  }
}

export function isImportError(err: unknown): err is ImportError {
  return err instanceof ImportError;
}

/** The code a failure is stored with: its own, or 'unknown' for anything unexpected. */
export function errorCodeFor(err: unknown): ErrorCode {
  return isImportError(err) ? err.code : 'unknown';
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
