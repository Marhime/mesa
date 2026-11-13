import { View } from 'react-native';

import type { HapticKind } from '../haptics';
import { createStyles } from '../theme';
import { border, radius, size, space, type ColorToken } from '../tokens';
import { Simmer } from './Simmer';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** primary = ink fill (one per screen) · secondary = outline pill · ghost = underlined text. */
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  tone?: 'default' | 'danger';
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  iconStart?: IconName;
  /** Given at the touch: `add` when it adds, `check` when it marks something at home. */
  haptic?: HapticKind;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size: sizeName = 'md',
  tone = 'default',
  fullWidth,
  loading,
  disabled,
  iconStart,
  haptic,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const styles = useStyles();
  const fg: ColorToken = variant === 'primary' ? 'onInk' : tone === 'danger' ? 'danger' : 'ink';
  const boxStyle = [
    styles.base,
    sizeName === 'lg' ? styles.lg : styles.md,
    variant === 'primary' ? styles.primary : variant === 'secondary' ? styles.secondary : styles.ghost,
    variant === 'secondary' && tone === 'danger' ? styles.secondaryDanger : null,
    fullWidth ? styles.fullWidth : null,
  ];
  return (
    <Touchable
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      haptic={haptic}
      feedback={variant === 'ghost' ? 'opacity' : 'scale'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading ?? false }}
      style={boxStyle}
    >
      {loading ? (
        <Simmer size="sm" color={fg} accessibilityLabel={`${label}, in progress`} />
      ) : (
        <View style={styles.content}>
          {iconStart ? <Icon name={iconStart} size={sizeName === 'lg' ? 'lg' : 'md'} color={fg} /> : null}
          {/* Large Dynamic Type: a long label goes onto a second line rather than being cut. */}
          <Text variant={sizeName === 'lg' ? 'labelLg' : 'label'} color={fg} underline={variant === 'ghost'} align="center" numberOfLines={2}>
            {label}
          </Text>
        </View>
      )}
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  base: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.sm,
    alignSelf: 'flex-start',
  },
  md: { minHeight: size.buttonMd },
  lg: { minHeight: size.buttonLg },
  primary: { backgroundColor: t.colors.ink },
  secondary: { borderWidth: border.control, borderColor: t.colors.lineStrong, backgroundColor: 'transparent' },
  secondaryDanger: { borderColor: t.colors.danger },
  ghost: { paddingHorizontal: space.sm, minHeight: size.touch },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
}));
