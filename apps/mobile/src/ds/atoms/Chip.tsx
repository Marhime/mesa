import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { HapticKind } from '../haptics';
import { createStyles } from '../theme';
import { border, radius, size, space } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface ChipProps {
  label: string;
  onPress?: () => void;
  /** Selected chips turn ink. A chip that can be selected gives the `select` haptic at the touch. */
  selected?: boolean;
  /** The haptic of a chip that acts rather than selects (`add`: on the list; `check`: at home). */
  haptic?: HapticKind;
  icon?: IconName;
  /** A leading element instead of an icon (e.g. a CategoryDot). */
  leading?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Read-only chip (preview of what was understood): no border, no press. */
  passive?: boolean;
}

/** Pill chip: filters, quick picks, previews. 36 high, 44 touch target. */
export function Chip({ label, onPress, selected, haptic, icon, leading, accessibilityLabel, accessibilityHint, passive }: ChipProps) {
  const styles = useStyles();
  const content = (
    <View style={styles.content}>
      {leading}
      {icon ? <Icon name={icon} size="sm" color={selected ? 'onSelect' : 'ink'} /> : null}
      {/* Long labels (Ask starters, Mesa's actions) take a second line where the row is too narrow. */}
      <Text variant="label" color={selected ? 'onSelect' : 'ink'} numberOfLines={2}>
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
      haptic={selected !== undefined ? 'select' : haptic}
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
    paddingVertical: space.xs,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
  },
  idle: { backgroundColor: t.colors.surfaceRaised, borderWidth: border.control, borderColor: t.colors.lineStrong },
  selected: { backgroundColor: t.colors.select, borderWidth: border.control, borderColor: t.colors.select },
  passive: { backgroundColor: t.colors.surfaceSunken, borderWidth: border.control, borderColor: t.colors.surfaceSunken },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
}));
