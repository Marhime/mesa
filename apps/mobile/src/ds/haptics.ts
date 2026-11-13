import * as Haptics from 'expo-haptics';

// Haptic feedback for the moments that matter: checking, adding, finishing shopping. Controls give theirs at
// the touch (Checkbox, selectable Chip, `haptic` on Button / Chip / IconButton, long press), never after the
// server answers. Failures are ignored (simulator, low power mode).

function run(p: Promise<void>): void {
  p.catch(() => undefined);
}

export const haptics = {
  check(): void {
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  add(): void {
    run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  select(): void {
    run(Haptics.selectionAsync());
  },
  success(): void {
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning(): void {
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
};

/** The haptic a control gives at the touch (Button, Chip, IconButton `haptic`). */
export type HapticKind = 'check' | 'add' | 'select';
