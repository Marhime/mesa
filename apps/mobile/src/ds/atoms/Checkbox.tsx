import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { timing } from '../motion';
import { createStyles } from '../theme';
import { border, radius, size } from '../tokens';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  /** e.g. "Milk". Announced as a checkbox with its state. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/** Round 24 pt checkbox, Notes-like. Checked = ink fill + cream check. 44 pt touch target. */
export function Checkbox({ checked, onToggle, accessibilityLabel, disabled }: CheckboxProps) {
  const styles = useStyles();
  const progress = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(checked ? 1 : 0, timing('press')));
  }, [checked, progress]);
  const fill = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ scale: 0.6 + progress.get() * 0.4 }] }));

  return (
    <Touchable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      style={styles.target}
    >
      <View style={styles.ring}>
        <Animated.View style={[styles.fill, fill]}>
          <Icon name="check" size="sm" color="onInk" />
        </Animated.View>
      </View>
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  target: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: size.checkbox,
    height: size.checkbox,
    borderRadius: radius.full,
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    width: size.checkbox,
    height: size.checkbox,
    borderRadius: radius.full,
    backgroundColor: t.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
