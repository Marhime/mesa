// OS integrations used by screens: opening links (in their app, or in the in-app browser) and the
// native share sheet.
import { useKeepAwake } from 'expo-keep-awake';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Share } from 'react-native';

/**
 * Pull to refresh that only spins for the person's own pull, not for background polling.
 * `usePullToRefresh(list.refetch, imports.refetch)`.
 */
export function usePullToRefresh(...refetchers: (() => Promise<unknown>)[]): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    Promise.allSettled(refetchers.map((r) => r())).finally(() => setRefreshing(false));
  };
  return { refreshing, onRefresh };
}

/** Opens a URL in its app (YouTube, Instagram) or the browser. */
export function useOpenUrl(): (url: string) => void {
  return useCallback((url: string) => {
    Linking.openURL(url).catch(() => undefined);
  }, []);
}

/**
 * Opens a page in the in-app browser, over what is on screen (a video to watch before saving it):
 * closing it comes back to the same place. Falls back to the video's app or the browser.
 */
export function useOpenInApp(): (url: string) => void {
  return useCallback((url: string) => {
    WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'close' }).catch(() => {
      Linking.openURL(url).catch(() => undefined);
    });
  }, []);
}

/** Keeps the screen on while a recipe is open (cooking with messy hands). */
export function useKeepScreenOn(): void {
  useKeepAwake('recipe');
}

/** The native share sheet for a short text. */
export function useShareText(): (message: string) => void {
  return useCallback((message: string) => {
    Share.share({ message }).catch(() => undefined);
  }, []);
}
