import { View } from 'react-native';

import { createStyles } from '../theme';
import { space } from '../tokens';
import { Avatar } from './Avatar';
import { Touchable } from './Touchable';

export interface AvatarGroupProps {
  names: (string | null)[];
  size?: 'sm' | 'md';
  max?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Overlapping avatars of the household. Pressable when it leads somewhere (Settings). */
export function AvatarGroup({ names, size = 'sm', max = 3, onPress, accessibilityLabel }: AvatarGroupProps) {
  const styles = useStyles();
  const shown = names.slice(0, max);
  const label = accessibilityLabel ?? names.filter(Boolean).join(', ');
  const row = (
    <View style={styles.row}>
      {shown.map((n, i) => (
        <View key={`${n ?? 'member'}-${i}`} style={i > 0 ? styles.overlap : null}>
          <Avatar name={n} size={size} ringed />
        </View>
      ))}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {row}
      </View>
    );
  }
  return (
    <Touchable onPress={onPress} accessibilityLabel={label} hitSlop={space.sm} style={styles.touch}>
      {row}
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginLeft: -space.sm },
  touch: { alignSelf: 'flex-start' },
}));
