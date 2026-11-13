import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Checkbox } from '../atoms/Checkbox';
import { Touchable } from '../atoms/Touchable';
import { createStyles } from '../theme';
import { space } from '../tokens';
import { useRowHighlight } from './listTone';

export interface CheckRowProps {
  /** What the row says (title, why, meta), between `leading` and the box. */
  children: ReactNode;
  checked: boolean;
  /** Ticks or unticks it. Omitted: it can't be picked (already done) and `done` shows instead of the box. */
  onToggle?: () => void;
  /** Shown at the end when it can't be picked ("Saved", "On the menu"). */
  done?: ReactNode;
  /** Before the text: a thumbnail (it can be its own button: offer it in `accessibilityActions` too). */
  leading?: ReactNode;
  /** Can't be ticked now (a limit is reached, it is being added). */
  disabled?: boolean;
  accessibilityLabel: string;
  /** VoiceOver reads the row as one checkbox: its other actions (Watch) go in the actions rotor. */
  accessibilityActions?: { name: string; label: string; onPress: () => void }[];
}

/**
 * A row that is one checkbox, Notes-like: tap anywhere to tick it, the box at the end, the `check` haptic as
 * it turns on, the press highlight on its list's tone. A dinner Mesa planned, a creator's video to import.
 */
export function CheckRow({ children, checked, onToggle, done, leading, disabled, accessibilityLabel, accessibilityActions }: CheckRowProps) {
  const styles = useStyles();
  const highlight = useRowHighlight();
  // A double tap still ticks it (`activate`) once the row lists other actions.
  const actions = [...(onToggle && accessibilityActions ? [{ name: 'activate', label: undefined, onPress: onToggle }] : []), ...(accessibilityActions ?? [])];
  const a11y = {
    accessibilityActions: actions.map(({ name, label }) => ({ name, label })),
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => actions.find((a) => a.name === e.nativeEvent.actionName)?.onPress(),
  };

  if (!onToggle) {
    return (
      <View style={styles.row} accessible accessibilityLabel={accessibilityLabel} {...a11y}>
        {leading}
        <View style={styles.body}>{children}</View>
        {done}
      </View>
    );
  }
  return (
    <Touchable
      onPress={onToggle}
      haptic={checked ? undefined : 'check'}
      disabled={disabled}
      feedback="highlight"
      {...highlight}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      {...a11y}
      style={styles.row}
    >
      {leading}
      <View style={styles.body}>{children}</View>
      <Checkbox checked={checked} />
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.md },
  body: { flex: 1, gap: space.xs },
}));
