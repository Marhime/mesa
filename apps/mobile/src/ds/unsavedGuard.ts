import { usePreventRemove } from 'expo-router';
import { useState } from 'react';

import { confirmDiscard } from './confirmDiscard';

/**
 * A screen that holds something typed (the recipe editor) never closes by mistake: while `unsaved`, its ×,
 * the swipe down or back and any other way back ask "Discard changes?" first, like a Sheet with `unsaved`.
 * Returns `leave`: call it once the work is saved, right before navigating away, so that one never asks.
 */
export function useUnsavedGuard(unsaved: boolean): () => void {
  const [left, setLeft] = useState(false);
  const allow = usePreventRemove(unsaved && !left, ({ repeat }) =>
    confirmDiscard(() => {
      setLeft(true);
      repeat();
    }),
  );
  return () => {
    setLeft(true);
    allow();
  };
}
