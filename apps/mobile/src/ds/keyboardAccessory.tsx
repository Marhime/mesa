import { createContext, useContext, type ReactNode } from 'react';
import { InputAccessoryView, View } from 'react-native';

import { createStyles, useTheme } from './theme';
import { layout, space } from './tokens';

/**
 * What a Screen attaches above the keyboard while one of its fields is typed in: its footer, the screen's submit
 * ("Save recipe"). A Sheet resets it, so its own fields don't show the screen's. iOS only (null elsewhere).
 */
export const KeyboardAccessoryContext = createContext<ReactNode>(null);

/** The bar a field shows above the keyboard, if its screen has one. */
export function useKeyboardAccessory(): ReactNode {
  return useContext(KeyboardAccessoryContext);
}

/**
 * The bar itself, for one field (`id` = its `inputAccessoryViewID`). One per field: an accessory attaches to one
 * text input only. It rides on the keyboard, so the field typed in is scrolled clear of it too.
 */
export function KeyboardAccessoryBar({ id, children }: { id: string; children: ReactNode }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <InputAccessoryView nativeID={id} backgroundColor={theme.colors.surface}>
      <View style={styles.bar}>{children}</View>
    </InputAccessoryView>
  );
}

const useStyles = createStyles(() => ({
  bar: { paddingHorizontal: layout.screenMargin, paddingVertical: space.sm },
}));
