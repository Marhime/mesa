import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env, isConfigured } from './env';

/**
 * The Supabase client. Sessions live in AsyncStorage and refresh themselves while the app is in
 * the foreground. When the keys are missing a placeholder client is created; it is never used
 * because the app shows the setup screen.
 */
export const supabase = createClient(
  isConfigured ? env.supabaseUrl : 'https://not-configured.invalid',
  isConfigured ? env.supabaseAnonKey : 'not-configured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh tokens only while the app is active (Supabase's React Native pattern).
if (isConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Throws the Supabase error, so TanStack Query sees a failure. */
export function must<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
