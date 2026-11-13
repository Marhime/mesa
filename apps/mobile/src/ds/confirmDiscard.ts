import { ActionSheetIOS, Alert, Platform } from 'react-native';

let asking = false;

/**
 * "Discard changes?" before something typed or changed is thrown away, the phone's own way: the iOS action
 * sheet (like Calendar and Reminders), an alert elsewhere. "Keep editing" is the cancel and does nothing;
 * only "Discard" (destructive) runs `discard`. One question at a time: asking again while it is up is ignored.
 */
export function confirmDiscard(discard: () => void): void {
  if (asking) return;
  asking = true;
  const answer = (discarded: boolean) => {
    asking = false;
    if (discarded) discard();
  };
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Discard changes?', options: ['Discard', 'Keep editing'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
      (index) => answer(index === 0),
    );
    return;
  }
  Alert.alert(
    'Discard changes?',
    undefined,
    [
      { text: 'Keep editing', style: 'cancel', onPress: () => answer(false) },
      { text: 'Discard', style: 'destructive', onPress: () => answer(true) },
    ],
    { cancelable: true, onDismiss: () => answer(false) },
  );
}
