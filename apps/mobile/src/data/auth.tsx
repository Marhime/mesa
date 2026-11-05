import type { Session } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { isConfigured } from './env';
import { forgetPushToken } from './push';
import { clearCache } from './queryClient';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  /** False until the stored session has been read. */
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: !isConfigured });

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => alive && setState({ session: data.session, ready: true }))
      .catch(() => alive && setState({ session: null, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearCache();
      setState({ session, ready: true });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthState {
  return useContext(AuthContext);
}

export function useUserId(): string | null {
  return useSession().session?.user.id ?? null;
}

export type PasswordMode = 'signIn' | 'signUp';

/**
 * Email + password. No email is ever sent: "Confirm email" is turned off in Supabase,
 * so sign-up returns a session right away.
 */
export function usePasswordAuth() {
  return useMutation({
    mutationFn: async ({ email, password, mode }: { email: string; password: string; mode: PasswordMode }) => {
      const credentials = { email: email.trim().toLowerCase(), password };
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword(credentials);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase.auth.signUp(credentials);
      if (error) throw error;
      // Supabase hides "already registered" behind an empty identities list.
      if (data.user && data.user.identities?.length === 0) throw new Error('User already registered');
      if (!data.session) throw new Error('confirm_email_required');
    },
  });
}

/** Sign in with Apple is offered only on iOS devices where it is available. */
export function useAppleAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);
  return available;
}

export function isCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ERR_REQUEST_CANCELED';
}

/** Native Sign in with Apple, then a Supabase session from the identity token. */
export function useAppleSignIn() {
  return useMutation({
    mutationFn: async () => {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token');
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) throw error;
      // Apple shares the name only on the very first sign-in: keep it as the display name.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
      if (name && data.user) {
        await supabase.from('profiles').update({ display_name: name }).eq('id', data.user.id);
      }
    },
  });
}

export async function signOut(): Promise<void> {
  await forgetPushToken();
  // The default (global) sign-out calls the server and keeps the session when that fails
  // (offline in the shop): sign this device out anyway.
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
  clearCache();
}
