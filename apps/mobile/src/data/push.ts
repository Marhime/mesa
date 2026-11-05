import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { supabase } from './supabase';

let registeredToken: string | null = null;
let handlerSet = false;

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Asks for notification permission and stores this device's Expo push token for the household,
 * so the import worker can say when a recipe failed. Skips silently on simulators, in builds without
 * an EAS project id, or when permission is denied.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!handlerSet) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }
    if (!Device.isDevice) return;
    const id = projectId();
    if (!id) return;
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token || token === registeredToken) return;
    const { error } = await supabase.rpc('register_push_token', { p_token: token });
    if (!error) registeredToken = token;
  } catch {
    // Push is a nice-to-have: never block the app on it.
  }
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

/** Registers the push token once the household exists. */
export function usePushRegistration(enabled: boolean): void {
  useEffect(() => {
    if (enabled) void registerPushToken();
  }, [enabled]);
}
