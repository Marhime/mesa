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
  /** line: a text line · media: a 16:10 image · tile: an On the menu tile's photo · check: a checkbox ·
   *  picto: a food pictogram in a row. */
  shape?: 'line' | 'media' | 'tile' | 'check' | 'picto';
  /** Width as a fraction of the container, for lines. */
  widthFraction?: number;
  radius?: RadiusToken;
}

/** Placeholder that breathes gently while content loads (the pulse is opacity only: it plays with Reduce motion too). */
export function Skeleton({ shape = 'line', widthFraction = 1, radius: r }: SkeletonProps) {
  const styles = useStyles();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(0.5, { duration: duration.pulse, easing: easeOut, reduceMotion: ReduceMotion.Never }), -1, true, undefined, ReduceMotion.Never));
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
  base: { backgroundColor: t.colors.skeleton },
  line: { height: size.skeletonLine, borderRadius: radius.full },
  media: { width: '100%', aspectRatio: aspect.recipeCard, borderRadius: radius.lg },
  tile: { width: '100%', height: size.dishTile },
  check: { width: size.checkbox, height: size.checkbox, borderRadius: radius.full },
  picto: { width: size.pictoSm, height: size.pictoSm, borderRadius: radius.full },
}));
