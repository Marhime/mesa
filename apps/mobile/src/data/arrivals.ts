// Lines that arrived from the other phone (live sync), so the list can flash them like your own adds.
import { useEffect, useRef } from 'react';

import { createdHere, isTempId } from './groceryMutations';

/** Calls `onArrive` with ids that appeared and weren't added on this phone. Never on first load. */
export function usePartnerArrivals(ids: readonly string[] | undefined, onArrive: (ids: string[]) => void): void {
  const known = useRef<Set<string> | null>(null);
  const callback = useRef(onArrive);
  callback.current = onArrive;
  const signature = ids?.join(',');
  useEffect(() => {
    if (!ids) return;
    const before = known.current;
    known.current = new Set(ids);
    if (!before) return;
    const arrived = ids.filter((id) => !before.has(id) && !isTempId(id) && !createdHere(id));
    if (arrived.length > 0) callback.current(arrived);
    // `signature` stands for `ids`: the effect runs when the set of lines changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
