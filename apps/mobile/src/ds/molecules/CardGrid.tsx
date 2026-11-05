import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { createStyles } from '../theme';
import { space } from '../tokens';

export interface CardGridProps {
  children: ReactNode;
  /** loose: recipe cards (16 gutter, 24 between rows) · tight: small tiles (12 both ways). */
  density?: 'loose' | 'tight';
}

/** Two-column grid of cards. */
export function CardGrid({ children, density = 'loose' }: CardGridProps) {
  const styles = useStyles();
  const tight = density === 'tight';
  const items = Children.toArray(children).filter(isValidElement);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={[styles.grid, tight ? styles.gridTight : null]}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, tight ? styles.rowTight : null]}>
          {row.map((item, c) => (
            <View key={c} style={styles.cell}>
              {item}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const useStyles = createStyles(() => ({
  grid: { gap: space.xxl },
  gridTight: { gap: space.md },
  row: { flexDirection: 'row', gap: space.lg },
  rowTight: { gap: space.md },
  cell: { flex: 1 },
}));
