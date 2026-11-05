import { Stack as Navigator, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';

import { DataProvider, signOut, useGate, useHouseholdLiveSync, usePushRegistration, useShareRedirect, type GateStatus } from '@/data';
import {
  Button,
  DesignSystemProvider,
  EmptyState,
  ErrorState,
  Screen,
  Stack,
  useAppFonts,
  useHideSplash,
  useStackScreenOptions,
} from '@/ds';

export default function RootLayout() {
  return (
    <DataProvider>
      <DesignSystemProvider>
        <RootNavigator />
      </DesignSystemProvider>
    </DataProvider>
  );
}

/** A screen crashed while rendering: say so and offer a way back instead of a blank app. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  useHideSplash(true);
  return (
    <Screen centered>
      <ErrorState title="Something went wrong" text="Mesa hit a problem on this screen." onRetry={() => void retry()} />
    </Screen>
  );
}

function RootNavigator() {
  const fontsReady = useAppFonts();
  const gate = useGate();
  // Once a screen is up, keep it while the next status loads (signed in → reading the profile):
  // returning null would unmount the navigator and flash an empty screen.
  const [settled, setSettled] = useState<GateStatus>(gate.status);
  if (gate.status !== 'loading' && gate.status !== settled) setSettled(gate.status);
  const status = gate.status === 'loading' ? settled : gate.status;
  const retry = gate.retry;
  const ready = fontsReady && status !== 'loading';
  const screenOptions = useStackScreenOptions();
  useHideSplash(ready);
  // Only once the navigator is rendered: a push before it mounts is dropped.
  useShareRedirect(ready && status === 'ready');
  usePushRegistration(status === 'ready');
  useHouseholdLiveSync(status === 'ready');

  if (!ready) return null;
  if (status === 'unconfigured') {
    return (
      <Screen centered>
        <EmptyState
          icon="plug"
          title="Mesa needs its keys"
          text="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env, then restart Expo."
        />
      </Screen>
    );
  }
  if (status === 'error') {
    return (
      <Screen centered>
        <Stack align="center" gap="sm">
          <ErrorState title="Couldn't open your kitchen" onRetry={retry} />
          <Button variant="ghost" label="Sign out" onPress={() => void signOut()} />
        </Stack>
      </Screen>
    );
  }

  return (
    <Navigator screenOptions={screenOptions}>
      <Navigator.Protected guard={status === 'signedOut'}>
        <Navigator.Screen name="sign-in" />
      </Navigator.Protected>
      <Navigator.Protected guard={status === 'needsHousehold'}>
        <Navigator.Screen name="setup" />
      </Navigator.Protected>
      <Navigator.Protected guard={status === 'ready'}>
        <Navigator.Screen name="(tabs)" />
        <Navigator.Screen name="recipe/[id]" />
        <Navigator.Screen name="cooked/[id]" options={{ gestureEnabled: false }} />
        <Navigator.Screen name="editor" />
        <Navigator.Screen name="settings" />
        <Navigator.Screen name="import" options={{ presentation: 'modal' }} />
      </Navigator.Protected>
    </Navigator>
  );
}
