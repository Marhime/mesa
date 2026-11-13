import type { HapticKind } from '../haptics';
import { createStyles } from '../theme';
import { border, radius, shadow, size, type ColorToken } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Touchable } from './Touchable';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only buttons must be labelled. */
  accessibilityLabel: string;
  onPress: () => void;
  /** surface: raised disc · ink: filled · float: over images and cards, with shadow · plain: no background. */
  variant?: 'surface' | 'ink' | 'float' | 'plain';
  /** Fill the glyph (favorite on). */
  filled?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  selected?: boolean;
  /** Given at the touch (`select` for favorite and Another idea, `add`, `check`). */
  haptic?: HapticKind;
}

const FG: Record<NonNullable<IconButtonProps['variant']>, ColorToken> = {
  surface: 'ink',
  ink: 'onInk',
  float: 'ink',
  plain: 'ink',
};

/** 44 × 44 round icon button. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  filled,
  disabled,
  accessibilityHint,
  selected,
  haptic,
}: IconButtonProps) {
  const styles = useStyles();
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      feedback="scale"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={[styles.base, styles[variant]]}
    >
      <Icon name={icon} color={FG[variant]} weight={filled ? 'fill' : 'bold'} />
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  base: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: { backgroundColor: t.colors.surfaceRaised, borderWidth: border.control, borderColor: t.colors.lineStrong },
  ink: { backgroundColor: t.colors.ink },
  float: { backgroundColor: t.colors.surfaceRaised, borderWidth: border.hairline, borderColor: t.colors.floatEdge, ...shadow.sm },
  plain: { backgroundColor: 'transparent' },
}));
