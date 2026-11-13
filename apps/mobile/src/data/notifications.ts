// What a tapped notification is about (a recipe ready, a scan to review, a failed save, something asked and
// left to Mesa: askKinds.ts says where each kind opens), opened once.
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { isAskKind, type AskKind } from './askKinds';

/** Something asked and left to Mesa: its job (and the recipe it is about, when the push says). */
export interface AskedTarget {
  kind: AskKind;
  jobId: string;
  recipeId: string | null;
}

export type NotificationTarget =
  | { to: 'asked'; job: AskedTarget }
  | { to: 'recipe'; recipeId: string }
  | { to: 'review'; proposalId: string }
  | { to: 'imports' }
  | { to: 'scans' };

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** The `data` the worker sends (apps/worker/src/push.ts and scan.ts). */
export function notificationTarget(data: Record<string, unknown> | null | undefined): NotificationTarget | null {
  if (!data) return null;
  const jobId = text(data.jobId);
  const recipeId = text(data.recipeId);
  // Asked jobs first: a translation, or a question about a recipe, also carries its recipeId (askKinds.ts says
  // whether that opens the recipe or Ask Mesa on that question).
  if (jobId && isAskKind(data.kind)) return { to: 'asked', job: { kind: data.kind, jobId, recipeId } };
  if (recipeId) return { to: 'recipe', recipeId };
  const proposalId = text(data.proposalId);
  if (proposalId) return { to: 'review', proposalId };
  if (jobId) return data.kind === 'sweep' || data.kind === 'receipt' ? { to: 'scans' } : { to: 'imports' };
  return null;
}

// Across remounts too: a notification opens its screen once.
const handled = new Set<string>();

/** Calls `open` when the person taps one of Mesa's notifications (also the one that launched the app). */
export function useNotificationTaps(open: (target: NotificationTarget) => void): void {
  const response = Notifications.useLastNotificationResponse();
  const callback = useRef(open);
  callback.current = open;
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    const target = notificationTarget(response.notification.request.content.data as Record<string, unknown> | undefined);
    if (target) callback.current(target);
  }, [response]);
}
