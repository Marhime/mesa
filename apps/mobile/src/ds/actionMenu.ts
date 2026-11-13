import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface MenuAction {
  label: string;
  onPress: () => void;
  /** Deletes or throws something away: shown in red. */
  destructive?: boolean;
}

/**
 * A few actions behind a ⋯ or a +, the phone's own way: the iOS action sheet (Cancel last), an alert
 * elsewhere. One look for every menu in the app.
 */
export function showActions(actions: readonly MenuAction[], title?: string): void {
  if (Platform.OS === 'ios') {
    const destructive = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...actions.map((a) => a.label), 'Cancel'],
        cancelButtonIndex: actions.length,
        ...(destructive >= 0 ? { destructiveButtonIndex: destructive } : {}),
      },
      (index) => actions[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title ?? '', undefined, [
    ...actions.map((a) => ({ text: a.label, onPress: a.onPress, style: a.destructive ? ('destructive' as const) : ('default' as const) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
