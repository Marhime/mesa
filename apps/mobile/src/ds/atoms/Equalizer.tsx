import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { easeOut } from '../motion';
import { createStyles, useTheme } from '../theme';
import { duration, iconSize, size as sizes, space, type ColorToken } from '../tokens';

export interface EqualizerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: ColorToken;
  /** Spoken by VoiceOver, e.g. "Loading recipes". */
  accessibilityLabel?: string;
}

const HEIGHT = { sm: iconSize.sm, md: iconSize.lg, lg: iconSize.xl } as const;

/** Mesa's loading indicator: three bouncing bars. Never a spinner. */
export function Equalizer({ size = 'md', color = 'ink', accessibilityLabel = 'Loading' }: EqualizerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const a = useSharedValue(0.35);
  const b = useSharedValue(0.35);
  const c = useSharedValue(0.35);

  useEffect(() => {
    const loop = (v: SharedValue<number>, delay: number) =>
      v.set(
        withDelay(
          delay,
          withRepeat(
            withSequence(
              withTiming(1, { duration: duration.small, easing: easeOut }),
              withTiming(0.35, { duration: duration.small, easing: easeOut }),
            ),
            -1,
            false,
            undefined,
            ReduceMotion.System,
          ),
        ),
      );
    loop(a, 0);
    loop(b, duration.press);
    loop(c, duration.small);
  }, [a, b, c]);

  const height = HEIGHT[size];
  const barColor = theme.colors[color];
  return (
    <View
      style={[styles.row, { height }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <Bar value={a} height={height} color={barColor} />
      <Bar value={b} height={height} color={barColor} />
      <Bar value={c} height={height} color={barColor} />
    </View>
  );
}

function Bar({ value, height, color }: { value: SharedValue<number>; height: number; color: string }) {
  const styles = useStyles();
  const animated = useAnimatedStyle(() => ({ height: height * value.get() }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, animated]} />;
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bar: { width: sizes.equalizerBar, borderRadius: sizes.equalizerBar },
}));
