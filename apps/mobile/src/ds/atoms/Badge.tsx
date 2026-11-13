import { View } from 'react-native';

import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';
import { Text } from './Text';

export interface BadgeProps {
  /** A count; omit for a plain dot. Hidden at 0. */
  count?: number;
}

/** Ink dot or count. */
export function Badge({ count }: BadgeProps) {
  const styles = useStyles();
  if (count === 0) return null;
  if (count === undefined) return <View style={styles.dot} />;
  return (
    <View style={styles.count} accessible={false}>
      <Text variant="overline" color="onInk" tabular chrome>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  dot: { width: size.dot, height: size.dot, borderRadius: radius.full, backgroundColor: t.colors.ink },
  count: {
    minWidth: size.badge,
    minHeight: size.badge,
    paddingHorizontal: space.xs,
    borderRadius: radius.full,
    backgroundColor: t.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
