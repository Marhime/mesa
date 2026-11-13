// How a sheet or screen speaks of the job it asked (workerAsk.ts): working, ready, or failed with a reason in
// the person's words, and whether asking again can help today; and leaving it while Mesa still works, the
// moment to offer notifications.
import { useCallback, useRef, useState } from 'react';

import { failsUntilTomorrow, friendlyError } from './errors';
import { askForPushOnce } from './push';
import type { AskJob, AskPhase } from './workerAsk';

/** The sentences a sheet uses when there is nothing to show. */
export interface AskFailureWords {
  /** Queuing it failed (offline, too many today): the fallback under friendlyError. */
  notAsked: string;
  /** The job failed without words of its own. */
  failed: string;
  /** It answered, with nothing usable. */
  empty: string;
}

export type AskState = 'working' | 'ready' | 'failed';

interface AskSnapshot {
  phase: AskPhase;
  job: Pick<AskJob, 'error' | 'error_code'> | null | undefined;
  askError: unknown;
}

/** Why there is nothing to show: null while it works or once it answered (`answered`: something usable came back). */
export function askMessage(ask: AskSnapshot, answered: boolean, words: AskFailureWords): string | null {
  if (ask.phase === 'idle' || ask.phase === 'working' || (ask.phase === 'done' && answered)) return null;
  if (ask.askError) return friendlyError(ask.askError, words.notAsked);
  if (ask.phase === 'cancelled') return 'Cancelled.';
  if (ask.phase === 'done') return words.empty;
  return ask.job?.error?.trim() || words.failed;
}

/**
 * Asking again can help: not after Mesa's daily reading limit (aiDailyLimit), which only lifts tomorrow. Then
 * a failure is only dismissed: no Try again that would fail the same way.
 */
export function canAskAgain(ask: Pick<AskSnapshot, 'job'>): boolean {
  return !failsUntilTomorrow(ask.job?.error_code);
}

/** Nothing asked yet counts as working (the sheet asks as it opens). */
export function askState(phase: AskPhase, answered: boolean): AskState {
  if (phase === 'idle' || phase === 'working') return 'working';
  return phase === 'done' && answered ? 'ready' : 'failed';
}

export function askOutcome(
  ask: AskSnapshot,
  answered: boolean,
  words: AskFailureWords,
): { state: AskState; message: string | null; canRetry: boolean } {
  return { state: askState(ask.phase, answered), message: askMessage(ask, answered, words), canRetry: canAskAgain(ask) };
}

/**
 * A sheet or screen that can be left while Mesa works on it: `leave` hides it and, when it still works,
 * offers notifications (askForPushOnce). `show` and `leave` never change.
 */
export function useLeavable(working: boolean) {
  const [visible, setVisible] = useState(false);
  const stillWorking = useRef(working);
  stillWorking.current = working;
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);
  const leave = useCallback(() => {
    setVisible(false);
    if (stillWorking.current) askForPushOnce();
  }, []);
  return { visible, show, hide, leave };
}
