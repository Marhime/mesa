import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { createStyles } from '../theme';
import { space } from '../tokens';

export interface CardGridProps {
  children: ReactNode;
}

/** Two-column grid of recipe cards: 16 between columns, 24 between rows. */
export function CardGrid({ children }: CardGridProps) {
  const styles = useStyles();
  const items = Children.toArray(children).filter(isValidElement);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
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
  row: { flexDirection: 'row', gap: space.lg },
  cell: { flex: 1 },
}));
