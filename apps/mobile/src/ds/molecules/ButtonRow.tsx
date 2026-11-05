import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { createStyles } from '../theme';
import { space } from '../tokens';

export interface ButtonRowProps {
  /** Two (rarely three) full-width Buttons; they share the row equally. */
  children: ReactNode;
}

/** Buttons side by side, equal widths ("Plan it" · "Cooked!"). */
export function ButtonRow({ children }: ButtonRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child, i) => (
          <View key={child.key ?? i} style={styles.cell}>
            {child}
          </View>
        ))}
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', gap: space.md },
  cell: { flex: 1 },
}));
