import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, radius, space } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export interface TagProps {
  label: string;
  icon?: IconName;
  /** sunken: small muted pill (the recipe a grocery item is for) · outline: status pill ("To buy", "Sun"). */
  variant?: 'sunken' | 'outline';
}

/** Small pill: a recipe name on a grocery line, or a status at the end of a row. */
export function Tag({ label, icon, variant = 'sunken' }: TagProps) {
  const styles = useStyles();
  const outline = variant === 'outline';
  return (
    <View style={[styles.tag, outline ? styles.outline : styles.sunken]}>
      {icon ? <Icon name={icon} size="sm" color={outline ? 'ink' : 'inkMuted'} /> : null}
      <Text variant={outline ? 'captionStrong' : 'microStrong'} color={outline ? 'ink' : 'inkMuted'} numberOfLines={1}>
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
  sunken: { backgroundColor: t.colors.surfaceSunken, paddingHorizontal: space.sm, paddingVertical: border.strong },
  outline: {
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
    paddingHorizontal: space.md - border.control,
    paddingVertical: space.xs - border.control,
  },
}));
