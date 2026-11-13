// How the data layer says what happened: one sentence and, maybe, a way to take it back (a toast with
// Undo) or the error tone. Screens show it (`(message, notice) => toast.show({ message, ...notice })`).
import { friendlyError } from './errors';

export interface Notice {
  /** Usually "Undo". */
  action?: { label: string; onPress: () => void };
  /** A failure: the error look (and haptic). */
  tone?: 'error';
}

export type Notify = (message: string, notice?: Notice) => void;

/** A toast with Undo. */
export const undoNotice = (onUndo: () => void): Notice => ({ action: { label: 'Undo', onPress: onUndo } });

/** Says a failure, in the person's words, with the error tone. */
export function notifyError(notify: Notify, error: unknown, fallback: string): void {
  notify(friendlyError(error, fallback), { tone: 'error' });
}
