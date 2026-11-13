import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';

import { ASK_KINDS, askKind } from './askKinds';
import { supabase } from './supabase';

let registeredToken: string | null = null;
let handlerSet = false;
/** Job kinds whose news the open app shows itself: recipe imports, and the asked kinds that say so. */
const IN_APP_KINDS: ReadonlySet<string> = new Set(['recipe', ...ASK_KINDS.filter((k) => askKind(k).inApp)]);

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? undefined;
}

function setHandler(): void {
  if (handlerSet) return;
  Notifications.setNotificationHandler({
    // With the app open, a recipe's news or an answer to something asked (a creator's videos, ideas, a
    // translation) shows in the app itself (a card, a toast, the open sheet): no banner on top.
    handleNotification: async (n) => {
      const data = (n.request.content.data ?? {}) as Record<string, unknown>;
      const inApp = typeof data.recipeId === 'string' || (typeof data.kind === 'string' && IN_APP_KINDS.has(data.kind));
      return { shouldShowBanner: !inApp, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
  handlerSet = true;
}

/**
 * Stores this device's Expo push token for the household, so the worker can say when a recipe or a
 * scan is ready. Asks for permission only when `ask` is true (right after a first import or scan,
 * when the person sees why). Skips silently on simulators, in builds without an EAS project id, or
 * when permission is not granted.
 */
async function registerPushToken(ask: boolean): Promise<boolean> {
  try {
    setHandler();
    if (!Device.isDevice) return false;
    const id = projectId();
    if (!id) return false;
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted || !ask || !current.canAskAgain ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return false;
    if (token === registeredToken) return true;
    const { error } = await supabase.rpc('register_push_token', { p_token: token });
    if (!error) registeredToken = token;
    return true;
  } catch {
    // Push is a nice-to-have: never block the app on it.
    return false;
  }
}

/**
 * Asks once for notifications after an action that finishes later (a scan, leaving a sheet or a recipe
 * while Mesa still works on it). No-op when already decided.
 */
export function askForPushOnce(): void {
  void registerPushToken(true);
}

/** Removes this device's token before signing out. */
export async function forgetPushToken(): Promise<void> {
  if (!registeredToken) return;
  try {
    await supabase.from('push_tokens').delete().eq('token', registeredToken);
  } catch {
    // ignore
  }
  registeredToken = null;
}

/** Keeps the token fresh once the household exists, without ever prompting. */
export function usePushRegistration(enabled: boolean): void {
  useEffect(() => {
    if (enabled) void registerPushToken(false);
  }, [enabled]);
}

export type PushPermission = 'granted' | 'undecided' | 'denied' | 'unavailable';

/** Where notifications stand on this phone, and a way to ask (the Import screen's "Notify me"). */
export function usePushPermission(): { permission: PushPermission; ask: () => void } {
  const [permission, setPermission] = useState<PushPermission>('unavailable');
  const read = useCallback(async () => {
    if (!Device.isDevice || !projectId()) return setPermission('unavailable');
    try {
      const p = await Notifications.getPermissionsAsync();
      setPermission(p.granted ? 'granted' : p.canAskAgain ? 'undecided' : 'denied');
    } catch {
      setPermission('unavailable');
    }
  }, []);
  useEffect(() => {
    void read();
  }, [read]);
  const ask = useCallback(() => {
    void registerPushToken(true).then(read);
  }, [read]);
  return { permission, ask };
}
