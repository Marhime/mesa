import { duration } from './tokens';

/**
 * Leaving a modal screen for another screen ("Open recipe" once saved): call it right after closing the
 * modal, and the next screen opens once the sheet is down. Pushed while the sheet still leaves, that screen
 * is laid out in the shrunk app behind it: its header sits too low, under a gap (expo-router: "close the
 * modal before you navigate").
 */
export function openAfterModal(open: () => void): void {
  setTimeout(open, duration.modalExit);
}
