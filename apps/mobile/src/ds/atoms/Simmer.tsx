import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { createStyles, useTheme } from '../theme';
import { duration, iconSize, space, type ColorToken } from '../tokens';

export interface SimmerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: ColorToken;
  /** Spoken by VoiceOver, e.g. "Loading recipes". */
  accessibilityLabel?: string;
}

const HEIGHT = { sm: iconSize.sm, md: iconSize.lg, lg: iconSize.xl } as const;
/** One bubble's life: it appears at the bottom, rises and fades. */
const CYCLE = duration.simmer;
/** Bubbles of a pot on low heat: three sizes, one after the other. */
const BUBBLES = [
  { scale: 0.34, delay: 0 },
  { scale: 0.26, delay: CYCLE * 0.375 },
  { scale: 0.3, delay: CYCLE * 0.625 },
] as const;

const linear = { duration: CYCLE, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never };

/**
 * Mesa's loading indicator: three bubbles rising, like a pot simmering. Never a spinner.
 * With Reduce motion on, the bubbles stay in place and glow in turn (opacity only), so work still shows.
 */
export function Simmer({ size = 'md', color = 'ink', accessibilityLabel = 'Loading' }: SimmerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const still = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);

  useEffect(() => {
    const loop = (v: SharedValue<number>, delay: number) =>
      v.set(
        withDelay(
          delay,
          withRepeat(withSequence(withTiming(1, linear), withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never })), -1, false, undefined, ReduceMotion.Never),
          ReduceMotion.Never,
        ),
      );
    [a, b, c].forEach((v, i) => loop(v, BUBBLES[i]!.delay));
  }, [a, b, c]);

  const height = HEIGHT[size];
  const fill = theme.colors[color];
  return (
    <View style={[styles.row, { height, width: height * 1.5 }]} accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      {[a, b, c].map((v, i) => (
        <Bubble key={i} progress={v} diameter={height * BUBBLES[i]!.scale} rise={height * 0.62} color={fill} still={still} />
      ))}
    </View>
  );
}

function Bubble({ progress, diameter, rise, color, still }: { progress: SharedValue<number>; diameter: number; rise: number; color: string; still: boolean }) {
  const animated = useAnimatedStyle(() => {
    const p = progress.get();
    // Fades in as it leaves the bottom, out as it reaches the top.
    const opacity = Math.sin(Math.PI * p);
    if (still) return { opacity: 0.3 + 0.7 * opacity, transform: [{ translateY: -rise / 2 }] };
    return { opacity, transform: [{ translateY: -rise * p }, { scale: 0.7 + 0.3 * p }] };
  });
  return <Animated.View style={[{ width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: color }, animated]} />;
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: space.xs },
}));
