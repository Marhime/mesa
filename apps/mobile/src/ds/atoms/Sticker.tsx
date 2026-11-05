import { useEffect } from 'react';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { pop } from '../motion';
import { createStyles } from '../theme';
import { art, border, duration, radius, shadow, size, space, tilt as tilts } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export interface StickerProps {
  label: string;
  icon?: IconName;
  tilt?: 'left' | 'right';
}

/** A tilted lime label that pops in: a small win ("Uses 3 things you have"). */
export function Sticker({ label, icon, tilt = 'left' }: StickerProps) {
  const styles = useStyles();
  const angle = tilts[tilt];
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withDelay(duration.small, withTiming(1, pop()), ReduceMotion.System));
  }, [shown]);
  const animated = useAnimatedStyle(() => {
    const p = shown.get();
    return { opacity: Math.min(1, p * 2), transform: [{ rotate: `${angle - 14 * (1 - p)}deg` }, { scale: 0.6 + 0.4 * p }] };
  });
  return (
    <Animated.View style={[styles.sticker, animated]} accessible accessibilityLabel={label}>
      {icon ? <Icon name={icon} size="sm" color="onTint" /> : null}
      <Text variant="sticker" color="onTint" numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const useStyles = createStyles(() => ({
  sticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: size.sticker,
    // Text sits 12 pt from the outer edge, border included.
    paddingHorizontal: space.md - border.strong,
    borderRadius: radius.full,
    borderWidth: border.strong,
    borderColor: art.ink,
    backgroundColor: art.lime,
    ...shadow.hard,
  },
}));
