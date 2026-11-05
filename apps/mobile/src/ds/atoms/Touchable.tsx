import type { ReactNode } from 'react';
import {
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { timing } from '../motion';
import { opacity } from '../tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TouchableProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** opacity: text and icons · scale: filled controls · highlight: rows (background tint). */
  feedback?: 'opacity' | 'scale' | 'highlight';
  /** Resting and pressed backgrounds for `highlight`. */
  highlightFrom?: string;
  highlightTo?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The single pressable primitive of the design system (internal: screens use Button, ListRow…).
 * Pressed state animates in 125 ms, ease-out.
 */
export function Touchable({
  children,
  onPress,
  onLongPress,
  disabled,
  feedback = 'opacity',
  highlightFrom = 'transparent',
  highlightTo = 'transparent',
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  hitSlop,
  style,
  testID,
}: TouchableProps) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => {
    const p = pressed.get();
    if (feedback === 'scale') return { transform: [{ scale: 1 - p * 0.03 }], opacity: 1 - p * 0.12 };
    if (feedback === 'highlight') return { backgroundColor: interpolateColor(p, [0, 1], [highlightFrom, highlightTo]) };
    return { opacity: 1 - p * (1 - opacity.pressed) };
  });
  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => pressed.set(withTiming(1, timing('press')))}
      onPressOut={() => pressed.set(withTiming(0, timing('press')))}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled ?? false, ...accessibilityState }}
      hitSlop={hitSlop}
      style={[style, animated, disabled ? { opacity: opacity.disabled } : null]}
      testID={testID}
    >
      {children}
    </AnimatedPressable>
  );
}
