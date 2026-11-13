// Whether live sync is connected (live.ts). While it is, the worker's progress arrives by itself: the
// quick polls of jobs stop, and come back as the fallback when the channel is down.
import { useSyncExternalStore } from 'react';

let connected = false;
const listeners = new Set<() => void>();

export function setLiveConnected(value: boolean): void {
  if (value === connected) return;
  connected = value;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while live sync is subscribed. */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(subscribe, () => connected);
}

/** A poll interval for work in progress: `ms` while live sync is down, none while it is up. */
export function usePoll(ms: number): number | false {
  return useLiveConnected() ? false : ms;
}
