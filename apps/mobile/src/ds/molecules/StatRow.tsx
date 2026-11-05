import { Fragment } from 'react';
import { View } from 'react-native';

import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { border, space } from '../tokens';

export interface StatRowProps {
  items: { value: string; label: string }[];
}

/** Two to four key numbers between hairlines ("35 min · Total time"). */
export function StatRow({ items }: StatRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {items.map((item, i) => (
        <Fragment key={item.label}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.cell} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
            <Text variant="heading" align="center" tabular numberOfLines={1}>
              {item.value}
            </Text>
            <Text variant="micro" color="inkMuted" align="center" numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  row: {
    flexDirection: 'row',
    paddingVertical: space.md,
    borderTopWidth: border.hairline,
    borderBottomWidth: border.hairline,
    borderColor: t.colors.line,
  },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: border.strong },
  divider: { width: border.hairline, backgroundColor: t.colors.line },
}));
