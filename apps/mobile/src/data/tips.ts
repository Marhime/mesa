// One-time tips ("You're in Casa", "Save from Instagram", where favorites go): shown until dismissed,
// remembered on this phone.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'mesa.tip.';
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

/** Marks a tip as done from anywhere (e.g. the first share hides "Save from Instagram"). */
export function dismissTip(key: string): void {
  AsyncStorage.setItem(PREFIX + key, '1')
    .catch(() => undefined)
    .finally(() => notify(key));
}

/** `visible` is false while reading storage, so a tip never flashes for someone who dismissed it. */
export function useTip(key: string | null): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const read = () =>
      AsyncStorage.getItem(PREFIX + key)
        .then((v) => alive && setVisible(v === null))
        .catch(() => undefined);
    void read();
    const set = listeners.get(key) ?? new Set();
    set.add(read);
    listeners.set(key, set);
    return () => {
      alive = false;
      set.delete(read);
    };
  }, [key]);
  const dismiss = useCallback(() => {
    if (!key) return;
    setVisible(false);
    dismissTip(key);
  }, [key]);
  return { visible: !!key && visible, dismiss };
}

export const TIP = {
  /** Per household: shown once there is someone to share with. */
  welcome: (householdId: string) => `welcome.${householdId}`,
  shareHowTo: 'share-howto',
  /** The first heart set on this phone says where favorites show up (a toast, not a card). */
  cookAgain: 'favorite-cook-again',
} as const;
