import { useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { confirmDiscard } from '../confirmDiscard';

/**
 * The one way out of a sheet: the scrim, the ×, a drag and VoiceOver's escape all `request` it. While
 * something typed or changed would be lost (`unsaved`), it asks "Discard changes?" first and closes only on
 * Discard; `held` tells the drag (on the UI thread) to spring back instead of leaving. Closing from outside
 * (after a Save) never goes through here, so it never asks.
 */
export function useSheetClose(onClose: () => void, unsaved: boolean) {
  const held = useSharedValue(unsaved);
  useEffect(() => {
    held.set(unsaved);
  }, [held, unsaved]);

  return {
    request: () => (unsaved ? confirmDiscard(onClose) : onClose()),
    held,
  };
}
