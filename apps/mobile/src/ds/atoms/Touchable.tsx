import type { ReactNode } from 'react';
import {
  Pressable,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type AccessibilityState,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptics, type HapticKind } from '../haptics';
import { timing } from '../motion';
import { opacity } from '../tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TouchableProps {
  children: ReactNode;
  onPress?: () => void;
  /** A long press gives the `select` haptic as it fires (edit a grocery line, take a dish off the menu). */
  onLongPress?: () => void;
  disabled?: boolean;
  /** The haptic given at the touch, before `onPress` runs (adding: `add`; marking at home: `check`). */
  haptic?: HapticKind;
  /** opacity: text and links · scale: controls and cards · highlight: rows (background tint). */
  feedback?: 'opacity' | 'scale' | 'highlight';
  /** Resting and pressed backgrounds for `highlight`. */
  highlightFrom?: string;
  highlightTo?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  /** Extra VoiceOver actions (the rotor), e.g. "Take off the menu" for a long-press-only action. */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The single pressable primitive of the design system (internal: screens use Button, ListRow…).
 * The pressed state shows in `touch` (50 ms) and eases back in `press` (100 ms).
 */
export function Touchable({
  children,
  onPress,
  onLongPress,
  disabled,
  haptic,
  feedback = 'opacity',
  highlightFrom = 'transparent',
  highlightTo = 'transparent',
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessibilityActions,
  onAccessibilityAction,
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
      onPress={
        onPress && haptic
          ? () => {
              haptics[haptic]();
              onPress();
            }
          : onPress
      }
      onLongPress={
        onLongPress
          ? () => {
              haptics.select();
              onLongPress();
            }
          : undefined
      }
      disabled={disabled}
      // The finger shows at once; letting go eases back.
      onPressIn={() => pressed.set(withTiming(1, timing('touch')))}
      onPressOut={() => pressed.set(withTiming(0, timing('press')))}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled ?? false, ...accessibilityState }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      hitSlop={hitSlop}
      style={[style, animated, disabled ? { opacity: opacity.disabled } : null]}
      testID={testID}
    >
      {children}
    </AnimatedPressable>
  );
}
