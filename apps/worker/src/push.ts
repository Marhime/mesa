// Expo push to the phones of whoever asked: the transport, and the two pushes every kind can send
// (failed, and a recipe ready). Titles come from the job kinds registry (@mesa/shared JOB_KINDS); what an
// asked job says when ready is in ready-pushes.ts, when to send any of them in notify.ts.
// Errors are logged, never thrown: the job update matters more.
import type { SupabaseClient } from '@supabase/supabase-js';
import { jobKind, type ImportKind } from '@mesa/shared';
import type { Logger } from './log';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Who gets it: the person who shared, or the whole household for jobs from before created_by. */
export interface PushTarget {
  householdId: string;
  userId: string | null;
}

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

/** The job's own error is the body: it already says what to do instead. */
export function failurePush(kind: ImportKind, jobId: string, message: string): PushContent {
  return { title: jobKind(kind).failureTitle, body: message, data: { jobId, kind } };
}

/** A recipe imported: its own title, "Ready in Recipes". */
export function readyPush(recipeId: string, title: string): PushContent {
  return { title: title.trim() || (jobKind('recipe').readyTitle ?? ''), body: 'Ready in Recipes', data: { recipeId } };
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

async function targetTokens(db: SupabaseClient, target: PushTarget): Promise<string[]> {
  let query = db.from('push_tokens').select('token').eq('household_id', target.householdId);
  // Tokens registered before user_id existed still count until the app registers them again.
  if (target.userId) query = query.or(`user_id.eq.${target.userId},user_id.is.null`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { token: string }) => r.token).filter((t) => t.length > 0);
}

export async function sendPush(
  db: SupabaseClient,
  target: PushTarget,
  content: PushContent,
  log: Logger,
  accessToken: string | null,
): Promise<void> {
  try {
    const tokens = await targetTokens(db, target);
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
