import type { ReactNode } from 'react';
import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, radius, size, space } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface ChipProps {
  label: string;
  onPress?: () => void;
  /** Selected chips turn lime. */
  selected?: boolean;
  icon?: IconName;
  /** A leading element instead of an icon (e.g. a CategoryDot). */
  leading?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Read-only chip (preview of what was understood): no border, no press. */
  passive?: boolean;
}

/** Pill chip: filters, quick picks, previews. 36 high, 44 touch target. */
export function Chip({ label, onPress, selected, icon, leading, accessibilityLabel, accessibilityHint, passive }: ChipProps) {
  const styles = useStyles();
  const content = (
    <View style={styles.content}>
      {leading}
      {icon ? <Icon name={icon} size="sm" color={selected ? 'onTint' : 'ink'} /> : null}
      <Text variant="label" color={selected ? 'onTint' : 'ink'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (passive || !onPress) {
    return (
      <View style={[styles.base, passive ? styles.passive : styles.idle, selected ? styles.selected : null]} accessible accessibilityLabel={accessibilityLabel ?? label}>
        {content}
      </View>
    );
  }
  return (
    <Touchable
      onPress={onPress}
      feedback="scale"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: selected ?? false }}
      hitSlop={{ top: (size.touch - size.chip) / 2, bottom: (size.touch - size.chip) / 2 }}
      style={[styles.base, selected ? styles.selected : styles.idle]}
    >
      {content}
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  base: {
    minHeight: size.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  idle: { backgroundColor: t.colors.surfaceRaised, borderWidth: border.control, borderColor: t.colors.lineStrong },
  selected: { backgroundColor: t.colors.select, borderWidth: border.control, borderColor: t.colors.select },
  passive: { backgroundColor: t.colors.surfaceSunken, borderWidth: border.control, borderColor: t.colors.surfaceSunken },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
}));
