// Turns Supabase / network errors into short, human sentences: a table of rules, first match wins. A
// sentence that only makes sense for one action (an invite code) belongs to that action's mutation, which
// throws a UserFacingError with it.
import type { ErrorCode } from '@mesa/shared';

interface MaybePgError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as MaybePgError).code : undefined;
}

function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null ? ((error as MaybePgError).message ?? '') : String(error);
}

export function isNetworkError(error: unknown): boolean {
  return /network request failed|failed to fetch|network error|timed? ?out|offline/i.test(errorMessage(error));
}

/** The daily cap on imports and questions to Mesa (import_job_rules): nothing more starts until tomorrow. */
export function isQuotaError(error: unknown): boolean {
  return /too many imports today/i.test(errorMessage(error));
}

/** Why a job failed (import_jobs.error_code) when trying again can only fail the same way until tomorrow. */
const UNTIL_TOMORROW: ReadonlySet<string> = new Set<ErrorCode>(['aiDailyLimit']);

/** True when a failed job can't be helped today (Mesa's daily reading limit): no Try again, only dismiss it. */
export function failsUntilTomorrow(code: string | null | undefined): boolean {
  return !!code && UNTIL_TOMORROW.has(code);
}

/** An error whose message is already written for people (a permission to turn on, a code that doesn't work): shown as is. */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}

/** For withMessages: the database already wrote this one for people ("Too many tries. Wait an hour…"). */
export const AS_RAISED = (error: unknown): string => errorMessage(error);

/**
 * Rethrows an error raised with one of these SQL codes as a sentence for people (the action knows what its
 * codes mean: P0002 is "that code doesn't work" for an invite, "not found" elsewhere). `AS_RAISED` keeps
 * the database's own words.
 */
export function withMessages<T>(work: Promise<T>, byCode: Partial<Record<string, string | ((error: unknown) => string)>>): Promise<T> {
  return work.catch((error: unknown) => {
    const rule = byCode[errorCode(error) ?? ''];
    const message = typeof rule === 'function' ? rule(error) : rule;
    // The daily cap also raises P0001: its own sentence wins.
    throw message && !isQuotaError(error) ? new UserFacingError(message) : error;
  });
}

interface Rule {
  match: (error: unknown, message: string) => boolean;
  message: string | ((error: unknown) => string);
}

const RULES: Rule[] = [
  { match: (e) => e instanceof UserFacingError, message: (e) => (e as Error).message },
  { match: (e) => isNetworkError(e), message: "You're offline. Try again when you're connected." },
  { match: (e) => isQuotaError(e), message: 'Too many imports today. Try again tomorrow.' },
  // Try again on a job that is no longer failed (tapped twice, or it moved on meanwhile): import_job_rules.
  { match: (_e, m) => /only a failed job can be tried again/i.test(m), message: 'Mesa is already on this one.' },
  {
    match: (_e, m) => /token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i.test(m),
    message: "That code didn't work. Check it or send a new one.",
  },
  { match: (_e, m) => /invalid login credentials/i.test(m), message: 'Wrong email or password.' },
  { match: (_e, m) => /already registered|already been registered/i.test(m), message: 'This email already has an account. Sign in instead.' },
  { match: (_e, m) => /password should be|weak password|at least \d+ characters/i.test(m), message: 'Use a password of at least 6 characters.' },
  { match: (_e, m) => m === 'confirm_email_required', message: 'Open the email we just sent and tap the link, then sign in here.' },
  { match: (_e, m) => /email not confirmed/i.test(m), message: 'Confirm your email first: tap the link we sent you, then sign in.' },
  { match: (_e, m) => /rate limit|too many|security purposes/i.test(m), message: 'Too many tries. Wait a minute and try again.' },
  { match: (_e, m) => /invalid.*email|email.*invalid/i.test(m), message: 'Check the email address.' },
];

/** One sentence for a banner or toast. */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const message = typeof error === 'object' && error !== null ? ((error as MaybePgError).message ?? '') : '';
  const rule = RULES.find((r) => r.match(error, message));
  if (!rule) return fallback;
  return typeof rule.message === 'string' ? rule.message : rule.message(error);
}
