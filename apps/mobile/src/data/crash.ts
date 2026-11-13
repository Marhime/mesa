// After a crash: tell the household's developer what happened (client_errors), and offer a way out of a
// crash that keeps coming back from something saved on the phone (reset the cache and restart).
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { DevSettings, Platform } from 'react-native';

import { isConfigured } from './env';
import { persister, queryClient } from './queryClient';
import { supabase } from './supabase';

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const reported = new WeakSet<object>();

/** Sends a crash to client_errors. Best effort: never throws, never waits (offline or signed out, it is dropped). */
export function reportCrash(error: unknown, route: string | null): void {
  if (!isConfigured) return;
  try {
    if (typeof error === 'object' && error !== null) {
      if (reported.has(error)) return;
      reported.add(error);
    }
    const e = error instanceof Error ? error : new Error(String(error));
    const row = {
      message: (e.message || e.name || 'Unknown error').slice(0, MAX_MESSAGE),
      stack: e.stack ? e.stack.slice(0, MAX_STACK) : null,
      context: {
        route,
        version: Constants.expoConfig?.version ?? null,
        updateId: Updates.updateId,
        runtimeVersion: Updates.runtimeVersion,
        channel: Updates.channel,
        platform: `${Platform.OS} ${String(Platform.Version)}`,
        dev: __DEV__,
      },
    };
    // No .select(): the app may add a report but not read one back.
    supabase
      .from('client_errors')
      .insert(row)
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Reporting must never make things worse.
  }
}

/** Reports the error an error boundary caught, once (an error is reported once), with the screen it happened on. */
export function useReportCrash(error: unknown, route: string | null): void {
  useEffect(() => {
    reportCrash(error, route);
  }, [error, route]);
}

/**
 * Forgets what this phone saved (lists, recipes, changes not sent yet) and restarts Mesa, which reloads
 * everything from the account. The sign-in stays.
 */
export async function resetLocalData(): Promise<void> {
  queryClient.clear();
  try {
    await persister.removeClient();
  } catch {
    // nothing saved, or storage busy: the restart still helps
  }
  try {
    await Updates.reloadAsync();
  } catch {
    // Development builds without expo-updates: Metro reloads instead.
    DevSettings.reload();
  }
}
