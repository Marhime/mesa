import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, radius, size } from '../tokens';
import { Text } from './Text';

export interface AvatarProps {
  /** Display name; the first letter is shown. */
  name: string | null;
  size?: 'sm' | 'md';
  /** Ring in the screen background color, for overlapping groups. */
  ringed?: boolean;
}

export function initialOf(name: string | null): string {
  const t = (name ?? '').trim();
  return t.length > 0 ? String.fromCodePoint(t.codePointAt(0)!).toUpperCase() : '·';
}

/** Round avatar with the person's initial. No photos in the MVP. */
export function Avatar({ name, size: s = 'md', ringed }: AvatarProps) {
  const styles = useStyles();
  return (
    <View
      style={[styles.base, s === 'sm' ? styles.sm : styles.md, ringed ? styles.ring : null]}
      accessible
      accessibilityLabel={name ?? 'Member'}
    >
      <Text variant={s === 'sm' ? 'caption' : 'label'} color="ink">
        {initialOf(name)}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  base: {
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: { width: size.avatarSm, height: size.avatarSm },
  md: { width: size.avatarMd, height: size.avatarMd },
  ring: { borderWidth: border.strong, borderColor: t.colors.surface },
}));
