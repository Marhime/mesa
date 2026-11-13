// Whether what you see is saved: offline, changes waiting on this phone, or syncing them now.
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { plural } from '../lib/text';

export interface SyncStatus {
  online: boolean;
  /** Changes kept on this phone until the connection is back (the grocery list's). */
  waiting: number;
}

export function useSyncStatus(): SyncStatus {
  const online = useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
  const waiting = useMutationState({ filters: { status: 'pending', predicate: (m) => m.state.isPaused } }).length;
  return { online, waiting };
}

/** One quiet line, or null when everything is saved. */
export function syncLine({ online, waiting }: SyncStatus): string | null {
  if (!online) return waiting > 0 ? `Offline · ${plural(waiting, 'change', 'changes')} saved on this phone` : "Offline · you're seeing the last saved list";
  return waiting > 0 ? 'Back online · syncing your changes…' : null;
}

/** The sync line for a screen ("Offline · 3 changes saved on this phone"), or null. */
export function useSyncLine(): string | null {
  return syncLine(useSyncStatus());
}
