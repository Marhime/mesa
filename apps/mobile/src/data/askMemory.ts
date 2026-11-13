// Ask Mesa remembers the last conversation of each kitchen on this phone, so closing the app doesn't lose
// it: the questions, their answers, what was done, the searches under them and a question still on its
// way. After a day without a new question it starts afresh. Another kitchen never sees it (one slot per
// household), and signing out forgets them all.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import type { Turn } from './askConversation';

const PREFIX = 'mesa.ask.conversation.v2.';
/** Before one slot per kitchen: read once for its kitchen, then gone. */
const LEGACY_KEY = 'mesa.ask.conversation.v1';
const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 30;

export interface KeptTurn extends Turn {
  /** The search run under it (its videos come back from the job). */
  findJobId: string | null;
}

export interface KeptConversation {
  householdId: string;
  /** When the last question was asked (ms). */
  at: number;
  about: string | null;
  turns: KeptTurn[];
  /** The answers' actions already done ("turn:action"). */
  done: string[];
}

const keyOf = (householdId: string) => PREFIX + householdId;

const isConversation = (v: unknown): v is KeptConversation =>
  typeof v === 'object' && v !== null && Array.isArray((v as KeptConversation).turns) && typeof (v as KeptConversation).at === 'number';

async function read(key: string): Promise<unknown> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

/** The kept conversation of this kitchen, unless it is a day old (null when there is none). */
export async function loadConversation(householdId: string, now = Date.now()): Promise<KeptConversation | null> {
  try {
    let kept = await read(keyOf(householdId));
    if (!kept) {
      const legacy = await read(LEGACY_KEY);
      await AsyncStorage.removeItem(LEGACY_KEY);
      kept = legacy;
    }
    if (!isConversation(kept) || kept.householdId !== householdId || now - kept.at > KEEP_MS) return null;
    return kept;
  } catch {
    return null;
  }
}

/** Keeps it (the newest turns if it is long); nothing kept for an empty one. */
export function keepConversation(c: KeptConversation): void {
  const key = keyOf(c.householdId);
  const write = c.turns.length === 0 ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, JSON.stringify({ ...c, turns: c.turns.slice(-MAX_TURNS) }));
  write.catch(() => undefined);
}

/** Signing out: no conversation stays on the phone for the next account. */
export function forgetConversations(): void {
  AsyncStorage.getAllKeys()
    .then((keys) => AsyncStorage.multiRemove([LEGACY_KEY, ...keys.filter((k) => k.startsWith(PREFIX))]))
    .catch(() => undefined);
}

/**
 * The kitchen's kept conversation: `restore` gets it once it is read (when there is one), and `current`
 * is kept each time it changes, from then on (before, it would wipe the one being read). `current` must
 * keep its identity while nothing changes (useMemo): it is written when it changes, not on every render.
 */
export function useKeptConversation(
  householdId: string | null,
  current: KeptConversation | null,
  restore: (kept: KeptConversation) => void,
): void {
  const [loaded, setLoaded] = useState(false);
  const onKept = useRef(restore);
  onKept.current = restore;
  useEffect(() => {
    if (!householdId) return;
    let alive = true;
    void loadConversation(householdId).then((kept) => {
      if (!alive) return;
      if (kept) onKept.current(kept);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [householdId]);
  useEffect(() => {
    if (loaded && current) keepConversation(current);
  }, [loaded, current]);
}
