import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { isNetworkError } from './errors';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

/** Grocery mutations share one scope so they run in order (an add finishes before its check). */
export const GROCERY_SCOPE = { id: 'groceries' };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: WEEK,
      staleTime: 30_000,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Flaky supermarket signal: retry network failures a few times (1 s, 2 s, 4 s) before rolling back.
      retry: (failureCount, error) => isNetworkError(error) && failureCount < 3,
    },
  },
});

/** The whole cache is kept on the device, so lists open instantly and offline. */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'mesa.query-cache.v1',
  throttleTime: 1000,
});

/**
 * Forgets every cached row, in memory and on disk. Used on sign-out so the next account on this
 * phone never sees the previous household's list or recipes.
 */
export function clearCache(): void {
  queryClient.clear();
  Promise.resolve(persister.removeClient()).catch(() => undefined);
}

// Online status from NetInfo: mutations pause offline and resume on reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

// "Window focus" in React Native = the app coming back to the foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => sub.remove();
});
