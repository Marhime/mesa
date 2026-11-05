import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { duration } from './tokens';

// Keep the native splash up until fonts and the session are ready.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: duration.small, fade: true });

/** Hides the splash screen once `ready` turns true. */
export function useHideSplash(ready: boolean): void {
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
}
