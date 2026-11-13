import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, radius, space, type ColorToken } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export interface TagProps {
  label: string;
  icon?: IconName;
  /**
   * sunken: small muted pill (the recipe a grocery item is for) · outline: status pill ("To buy", "Sun") ·
   * ink: something new, like a count Badge ("2 new" on a creator).
   */
  variant?: 'sunken' | 'outline' | 'ink';
}

const FG: Record<NonNullable<TagProps['variant']>, ColorToken> = { sunken: 'inkMuted', outline: 'ink', ink: 'onInk' };

/** Small pill: a recipe name on a grocery line, a status at the end of a row, or what is new. */
export function Tag({ label, icon, variant = 'sunken' }: TagProps) {
  const styles = useStyles();
  const outline = variant === 'outline';
  return (
    <View style={[styles.tag, styles[variant]]}>
      {icon ? <Icon name={icon} size="sm" color={FG[variant]} /> : null}
      <Text variant={outline ? 'captionStrong' : 'microStrong'} color={FG[variant]} numberOfLines={1} chrome={variant === 'ink'}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderRadius: radius.full,
  },
  sunken: { backgroundColor: t.colors.surfaceSunken, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  ink: { backgroundColor: t.colors.ink, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  outline: {
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
    paddingHorizontal: space.md - border.control,
    paddingVertical: space.xs - border.control,
  },
}));
