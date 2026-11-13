// What the Supabase project allows at sign-in, read from its public settings endpoint. Lets the app
// hide Sign in with Apple until the Apple provider is turned on, without a new build.
import { useQuery } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { env, isConfigured } from './env';
import { HOUR } from './queryClient';

interface AuthSettings {
  apple: boolean;
}

const FALLBACK: AuthSettings = { apple: false };

function useAuthSettings(): AuthSettings {
  const query = useQuery({
    queryKey: ['auth-settings'],
    enabled: isConfigured,
    staleTime: HOUR,
    queryFn: async (): Promise<AuthSettings> => {
      const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey } });
      if (!res.ok) throw new Error(`auth settings ${res.status}`);
      const body = (await res.json()) as { external?: { apple?: boolean } };
      return { apple: body.external?.apple === true };
    },
  });
  return query.data ?? FALLBACK;
}

/** Sign in with Apple is offered only on iOS devices that support it, once the project accepts it. */
export function useAppleAvailable(): boolean {
  const { apple } = useAuthSettings();
  const [device, setDevice] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setDevice)
      .catch(() => setDevice(false));
  }, []);
  return device && apple;
}
