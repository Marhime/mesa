import { StyleSheet, View } from 'react-native';

import { createStyles } from '../theme';
import { radius, shadow, size } from '../tokens';
import { Icon } from './Icon';

/** The play disc centered over a video thumbnail (fills its parent; the parent is what plays). */
export function PlayDisc() {
  const styles = useStyles();
  return (
    <View style={[StyleSheet.absoluteFill, styles.area]} pointerEvents="none">
      <View style={styles.disc}>
        <Icon name="play" size="sm" weight="fill" />
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  area: { alignItems: 'center', justifyContent: 'center' },
  disc: {
    width: size.playDisc,
    height: size.playDisc,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
}));
