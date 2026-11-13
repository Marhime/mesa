import { Children, isValidElement, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { createStyles } from '../theme';
import { space, stackFontScale } from '../tokens';

export interface ButtonRowProps {
  /** Two (rarely three) full-width Buttons, the main one last; they share the row equally. */
  children: ReactNode;
}

/**
 * Buttons side by side, equal widths ("Plan it" · "Cooked!"). With large Dynamic Type (`stackFontScale`)
 * they stack instead, the main one on top, so no label is cut.
 */
export function ButtonRow({ children }: ButtonRowProps) {
  const styles = useStyles();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackFontScale;
  return (
    <View style={stacked ? styles.stack : styles.row}>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child, i) => (
          <View key={child.key ?? i} style={stacked ? null : styles.cell}>
            {child}
          </View>
        ))}
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', gap: space.md },
  // The last (main) button on top, like a sheet's footer.
  stack: { flexDirection: 'column-reverse', gap: space.sm },
  cell: { flex: 1 },
}));
