import { useEffect } from 'react';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { easeOut } from '../motion';
import { createStyles } from '../theme';
import { aspect, duration, radius, size, type RadiusToken } from '../tokens';

export interface SkeletonProps {
  /** line: a text line · block: a square thumbnail · media: a 16:10 image · row: a list row. */
  shape?: 'line' | 'block' | 'media' | 'row';
  /** Width as a fraction of the container, for lines. */
  widthFraction?: number;
  radius?: RadiusToken;
}

/** Placeholder in surfaceSunken that breathes gently while content loads. */
export function Skeleton({ shape = 'line', widthFraction = 1, radius: r }: SkeletonProps) {
  const styles = useStyles();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(0.5, { duration: duration.sheet * 2, easing: easeOut }), -1, true, undefined, ReduceMotion.System));
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View
      style={[
        styles.base,
        styles[shape],
        shape === 'line' ? { width: `${Math.round(widthFraction * 100)}%` } : null,
        r ? { borderRadius: radius[r] } : null,
        animated,
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const useStyles = createStyles((t) => ({
  base: { backgroundColor: t.colors.surfaceSunken },
  line: { height: size.skeletonLine, borderRadius: radius.full },
  block: { width: size.thumb, height: size.thumb, borderRadius: radius.sm },
  media: { width: '100%', aspectRatio: aspect.recipeCard, borderRadius: radius.lg },
  row: { width: '100%', height: size.listRow, borderRadius: radius.lg },
}));
