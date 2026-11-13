// "Share to Mesa" from Instagram, TikTok, YouTube, Safari or Photos (expo-share-intent).
// The native module exists only in development and store builds; in Expo Go this is inert.
import { ShareIntentModule, ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef, type ReactNode } from 'react';

import { findUrl } from '../lib/text';
import { MAX_SCREENSHOTS, type LocalImage } from './media';

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
  /** Screenshots of one recipe, in the order shared (at most 4); empty for a link or a text. */
  images: LocalImage[];
  title: string | null;
}

/** What was shared into the app, normalized. Null when nothing is waiting. */
export function useIncomingShare(): { share: IncomingShare | null; clear: () => void } {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  if (!shareAvailable || !hasShareIntent) return { share: null, clear: () => undefined };
  const images = (shareIntent.files ?? [])
    .filter((f) => f.mimeType?.startsWith('image/'))
    .slice(0, MAX_SCREENSHOTS)
    .map((f): LocalImage => ({ uri: f.path, width: f.width, height: f.height }));
  const hasImages = images.length > 0;
  const url = shareIntent.webUrl ?? findUrl(shareIntent.text);
  // With a link, the rest of the shared text is usually the post's caption: worth keeping.
  const text = shareIntent.text ? (url ? shareIntent.text.replace(url, ' ') : shareIntent.text).replace(/\s+/g, ' ').trim() || null : null;
  const share: IncomingShare = {
    url: hasImages ? null : url,
    text: hasImages ? null : text,
    images,
    title: shareIntent.meta?.title ?? null,
  };
  if (!share.url && !share.text && share.images.length === 0) return { share: null, clear: () => resetShareIntent() };
  return { share, clear: () => resetShareIntent() };
}

export interface ShareRedirect {
  /** Signed in with a household, and the app can navigate. */
  enabled: boolean;
  /** The Import screen is up. */
  onImport: boolean;
  /** Brings the Import screen up. */
  openImport: () => void;
}

/** Opens the Import screen when something is shared into the app (once signed in with a household). */
export function useShareRedirect({ enabled, onImport, openImport }: ShareRedirect): void {
  const { share, clear } = useIncomingShare();
  const waiting = share !== null;
  const open = useRef(openImport);
  open.current = openImport;
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
      open.current();
    }
  }, [enabled, waiting, onImport, clear]);
}
