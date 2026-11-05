// Expo push to a household's phones (failed imports, scans ready to review). Errors are logged, never
// thrown: the job update matters more.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './log';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const FAILURE_PUSH = { title: "Couldn't read this recipe", body: 'Send a screenshot or paste the text instead.' };

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
}

export interface PushContent {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export function pushMessages(tokens: readonly string[], content: PushContent): PushMessage[] {
  return tokens.map((to) => ({ to, ...content, sound: 'default' }));
}

export function failureMessages(tokens: readonly string[], jobId: string): PushMessage[] {
  return pushMessages(tokens, { ...FAILURE_PUSH, data: { jobId } });
}

/** Tokens Expo answered with DeviceNotRegistered (tickets come back in the order sent). */
export function unregisteredTokens(tokens: readonly string[], response: unknown): string[] {
  const data = (response as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  data.forEach((ticket: unknown, i) => {
    const t = ticket as { status?: string; details?: { error?: string; expoPushToken?: string } } | null;
    if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
      const token = t.details.expoPushToken ?? tokens[i];
      if (token) out.push(token);
    }
  });
  return out;
}

export function sendFailurePush(
  db: SupabaseClient,
  householdId: string,
  jobId: string,
  log: Logger,
  accessToken: string | null,
): Promise<void> {
  return sendPush(db, householdId, { ...FAILURE_PUSH, data: { jobId } }, log, accessToken);
}

export async function sendPush(
  db: SupabaseClient,
  householdId: string,
  content: PushContent,
  log: Logger,
  accessToken: string | null,
): Promise<void> {
  try {
    const { data, error } = await db.from('push_tokens').select('token').eq('household_id', householdId);
    if (error) throw new Error(error.message);
    const tokens = (data ?? []).map((r: { token: string }) => r.token).filter((t) => t.length > 0);
    if (tokens.length === 0) return;

    const stale: string[] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(pushMessages(batch, content)),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        log.warn('push_failed', { status: res.status, body });
        continue;
      }
      stale.push(...unregisteredTokens(batch, body));
    }
    if (stale.length > 0) {
      const { error: delError } = await db.from('push_tokens').delete().in('token', stale);
      if (delError) log.warn('push_token_cleanup_failed', { err: delError.message });
    }
    log.info('push_sent', { tokens: tokens.length, removed: stale.length });
  } catch (err) {
    log.warn('push_failed', { err });
  }
}
