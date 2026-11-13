import { Stack as Navigator, usePathname, useRootNavigationState, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useRef, useState } from 'react';

import {
  AskSheetsProvider,
  DataProvider,
  resetLocalData,
  signOut,
  useGate,
  useHouseholdLiveSync,
  usePushRegistration,
  useReportCrash,
  useShareRedirect,
  useAskSheetsOutlet,
  type GateStatus,
} from '@/data';
import {
  Button,
  CreatorSheet,
  DesignSystemProvider,
  EmptyState,
  ErrorState,
  InlineNote,
  Screen,
  Stack,
  UseItUpSheet,
  WeekPlanSheet,
  duration,
  useAppFonts,
  useHideSplash,
  useStackScreenOptions,
  useToast,
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

/**
 * A screen crashed while rendering: say so and offer a way back instead of a blank app. The crash is
 * reported (best effort); if it keeps coming back, resetting what the phone saved usually clears it.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useHideSplash(true);
  useReportCrash(error, usePathname() ?? null);
  const [resetting, setResetting] = useState(false);
  return (
    <Screen centered>
      <Stack align="center" gap="sm">
        <ErrorState title="Something went wrong" text="Mesa hit a problem on this screen." onRetry={() => void retry()} />
        <Button
          variant="ghost"
          label="Reset local data"
          loading={resetting}
          accessibilityHint="Clears what this phone saved and restarts Mesa"
          onPress={() => {
            setResetting(true);
            void resetLocalData().finally(() => setResetting(false));
          }}
        />
        <InlineNote text="If it keeps happening, reset: Mesa restarts and reloads your kitchen from your account." />
      </Stack>
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
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  // Where Ask Mesa came up from: a recipe asked about is just below it.
  const askFrom = useRef<string | null>(null);
  const askInStack = useRootNavigationState()?.routes?.some((r) => r.name === 'ask') ?? false;
  useHideSplash(ready);
  // Only once the navigator is rendered: a push before it mounts is dropped.
  useShareRedirect({ enabled: ready && status === 'ready', onImport: pathname === '/import', openImport: () => router.push('/import') });
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

  // One creator, ideas and week plan sheet and one Ask Mesa for every screen (screens open them through
  // useAskSheets); they start afresh with each kitchen (signing out, joining another one).
  return (
    <AskSheetsProvider
      // Adding buzzes at the press (the buttons do it); an error toast has its own (warning) haptic.
      notify={(message, notice) => toast.show({ message, ...notice })}
      // From Ask Mesa the recipe comes over the conversation (Back returns to it), unless Ask came up from
      // that recipe: then it goes back down to it.
      onOpenRecipe={(id) => {
        const href = `/recipe/${id}`;
        if (pathname === '/ask' && askFrom.current === href) router.back();
        else if (pathname !== href) router.push({ pathname: '/recipe/[id]', params: { id } });
      }}
      onShowAsk={() => {
        if (pathname === '/ask') return;
        // Under a recipe opened from an answer: back down to it, never a second one.
        if (askInStack) return router.dismissTo('/ask');
        askFrom.current = pathname;
        router.push('/ask');
      }}
      onFoodRecipes={(food) => router.navigate({ pathname: '/recipes', params: { uses: food.productId, usesName: food.name } })}
      sheetExitMs={duration.sheet}
    >
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
          <Navigator.Screen name="cooked/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
          {/* A modal screen: its × and the swipe ask before throwing away changes (useUnsavedGuard). */}
          <Navigator.Screen name="editor" options={{ presentation: 'modal' }} />
          <Navigator.Screen name="settings" />
          <Navigator.Screen name="import" options={{ presentation: 'modal' }} />
          {/* Rises from the Mesa button; no swipe closes it, only its ×. */}
          <Navigator.Screen name="ask" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        </Navigator.Protected>
      </Navigator>
      <AskSheets />
    </AskSheetsProvider>
  );
}

/** The app's sheets (creator, ideas, week plan), drawn here unless a modal screen draws them itself (import). */
function AskSheets() {
  const sheets = useAskSheetsOutlet('root');
  if (!sheets) return null;
  return (
    <>
      <CreatorSheet {...sheets.creator} />
      <UseItUpSheet {...sheets.ideas} />
      <WeekPlanSheet {...sheets.weekPlan} />
    </>
  );
}
