import * as Haptics from 'expo-haptics';

// Haptic feedback for the moments that matter: checking, adding, finishing shopping.
// Failures are ignored (simulator, low power mode).

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
