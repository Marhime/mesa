// "Share to Mesa" from Instagram, TikTok, YouTube, Safari or Photos (expo-share-intent).
// The native module exists only in development and store builds; in Expo Go this is inert.
import { useRouter, useSegments } from 'expo-router';
import { ShareIntentModule, ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef, type ReactNode } from 'react';

import { findUrl } from '../lib/text';
import type { LocalImage } from './media';

export const shareAvailable = ShareIntentModule != null;

// Not reset on background: a first share often arrives before sign-in, and fetching the email code,
// Apple's sheet or the notification prompt all background the app, which would drop it. The item is
// cleared instead when it is imported or the Import screen is left (useShareRedirect).
export function ShareProvider({ children }: { children: ReactNode }) {
  return <ShareIntentProvider options={{ disabled: !shareAvailable, resetOnBackground: false }}>{children}</ShareIntentProvider>;
}

export interface IncomingShare {
  url: string | null;
  text: string | null;
  image: LocalImage | null;
  title: string | null;
}

/** What was shared into the app, normalized. Null when nothing is waiting. */
export function useIncomingShare(): { share: IncomingShare | null; clear: () => void } {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  if (!shareAvailable || !hasShareIntent) return { share: null, clear: () => undefined };
  const file = shareIntent.files?.find((f) => f.mimeType?.startsWith('image/'));
  const url = shareIntent.webUrl ?? findUrl(shareIntent.text);
  const text = shareIntent.text && shareIntent.text.trim() !== url ? shareIntent.text.trim() : null;
  const share: IncomingShare = {
    url: file ? null : url,
    text: file || url ? null : text,
    image: file ? { uri: file.path, width: file.width, height: file.height } : null,
    title: shareIntent.meta?.title ?? null,
  };
  if (!share.url && !share.text && !share.image) return { share: null, clear: () => resetShareIntent() };
  return { share, clear: () => resetShareIntent() };
}

/** Opens the Import screen when something is shared into the app (once signed in with a household). */
export function useShareRedirect(enabled: boolean): void {
  const { share, clear } = useIncomingShare();
  const router = useRouter();
  const segments = useSegments();
  const waiting = share !== null;
  const onImport = segments[0] === 'import';
  // One redirect per shared item, so closing the Import screen never reopens it.
  const redirected = useRef(false);
  const wasOnImport = useRef(false);
  useEffect(() => {
    const leftImport = wasOnImport.current && !onImport;
    wasOnImport.current = onImport;
    if (!waiting) {
      redirected.current = false;
      return;
    }
    // Import was left without importing (e.g. swiped down): drop the item so the next share opens it.
    if (leftImport) {
      clear();
      return;
    }
    if (enabled && !onImport && !redirected.current) {
      redirected.current = true;
      router.push('/import');
    }
  }, [enabled, waiting, onImport, router, clear]);
}
