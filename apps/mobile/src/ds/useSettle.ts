import { useCallback, useEffect, useRef, useState } from 'react';

import { duration } from './tokens';

/**
 * A choice that waits a moment before it counts, like checking an item in Reminders:
 * `toggle()` shows it at once (`pending`) and commits after `duration.settle`; a second
 * `toggle()` before then cancels it. A pending choice still commits if the row goes away.
 */
export function useSettle(commit: () => void): { pending: boolean; toggle: () => void } {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  }, [commit]);

  const toggle = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setPending(false);
      return;
    }
    setPending(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current();
      // The committed row usually leaves the list; if it stays (the change failed), it shows its real state again.
      fallback.current = setTimeout(() => setPending(false), duration.settle);
    }, duration.settle);
  }, []);

  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
      if (timer.current) {
        clearTimeout(timer.current);
        latest.current();
      }
    },
    [],
  );

  return { pending, toggle };
}
