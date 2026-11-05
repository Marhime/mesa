// Turns Supabase / network errors into short, human sentences.

interface MaybePgError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as MaybePgError).code : undefined;
}

export function isNetworkError(error: unknown): boolean {
  const msg = typeof error === 'object' && error !== null ? ((error as MaybePgError).message ?? '') : String(error);
  return /network request failed|failed to fetch|network error|timed? ?out|offline/i.test(msg);
}

/** One sentence for a banner or toast. */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isNetworkError(error)) return "You're offline. Try again when you're connected.";
  const code = errorCode(error);
  if (code === 'P0002') return "That code doesn't work. Ask for a new one: codes last 7 days.";
  if (code === 'P0001') return 'You already belong to a household.';
  const msg = typeof error === 'object' && error !== null ? (error as MaybePgError).message : undefined;
  if (msg && /token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i.test(msg)) {
    return "That code didn't work. Check it or send a new one.";
  }
  if (msg && /invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (msg && /already registered|already been registered/i.test(msg)) return 'This email already has an account. Sign in instead.';
  if (msg && /password should be|weak password|at least \d+ characters/i.test(msg)) return 'Use a password of at least 6 characters.';
  if (msg === 'confirm_email_required') return 'Turn off "Confirm email" in Supabase (Authentication → Sign In / Providers → Email), then sign in.';
  if (msg && /email not confirmed/i.test(msg)) return 'Turn off "Confirm email" in Supabase, then sign in again.';
  if (msg && /rate limit|too many|security purposes/i.test(msg)) return 'Too many tries. Wait a minute and try again.';
  if (msg && /invalid.*email|email.*invalid/i.test(msg)) return 'Check the email address.';
  return fallback;
}
