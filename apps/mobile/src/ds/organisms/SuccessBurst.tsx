import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { Icon } from '../atoms/Icon';
import { haptics } from '../haptics';
import { easeSwing, pop } from '../motion';
import { createStyles } from '../theme';
import { art, border, duration, size } from '../tokens';

export interface SuccessBurstProps {
  /** Spoken by VoiceOver ("Cooked"). */
  accessibilityLabel: string;
  /** md: the Cooked! seal (120) · sm: a finished list (72). */
  size?: 'md' | 'sm';
  /** Buzz (success) when the check lands, so the feel and the sight arrive together. */
  haptic?: boolean;
}

// A ten-lobed seal, viewBox -2 -2 118 118.
const SEAL =
  'M56.0 4.4 L58.7 5.0 L61.2 6.5 L63.5 8.6 L65.6 10.8 L67.6 12.6 L69.7 13.8 L72.1 14.1 L74.8 13.8 L77.8 13.2 L80.9 12.9 L83.8 13.1 L86.3 14.3 L88.2 16.3 L89.3 19.0 L89.9 22.1 L90.3 25.1 L90.9 27.8 L91.9 29.9 L93.6 31.6 L96.0 32.9 L98.8 34.2 L101.5 35.7 L103.7 37.7 L105.1 40.1 L105.4 42.8 L104.7 45.6 L103.4 48.5 L101.9 51.2 L100.8 53.7 L100.4 56.0 L100.8 58.3 L101.9 60.8 L103.4 63.5 L104.7 66.4 L105.4 69.2 L105.1 71.9 L103.7 74.3 L101.5 76.3 L98.8 77.8 L96.0 79.1 L93.6 80.4 L91.9 82.1 L90.9 84.2 L90.3 86.9 L89.9 89.9 L89.3 93.0 L88.2 95.7 L86.3 97.7 L83.8 98.9 L80.9 99.1 L77.8 98.8 L74.8 98.2 L72.1 97.9 L69.7 98.2 L67.6 99.4 L65.6 101.2 L63.5 103.4 L61.2 105.5 L58.7 107.0 L56.0 107.6 L53.3 107.0 L50.8 105.5 L48.5 103.4 L46.4 101.2 L44.4 99.4 L42.3 98.2 L39.9 97.9 L37.2 98.2 L34.2 98.8 L31.1 99.1 L28.2 98.9 L25.7 97.7 L23.8 95.7 L22.7 93.0 L22.1 89.9 L21.7 86.9 L21.1 84.2 L20.1 82.1 L18.4 80.4 L16.0 79.1 L13.2 77.8 L10.5 76.3 L8.3 74.3 L6.9 71.9 L6.6 69.2 L7.3 66.4 L8.6 63.5 L10.1 60.8 L11.2 58.3 L11.6 56.0 L11.2 53.7 L10.1 51.2 L8.6 48.5 L7.3 45.6 L6.6 42.8 L6.9 40.1 L8.3 37.7 L10.5 35.7 L13.2 34.2 L16.0 32.9 L18.4 31.6 L20.1 29.9 L21.1 27.8 L21.7 25.1 L22.1 22.1 L22.7 19.0 L23.8 16.3 L25.7 14.3 L28.2 13.1 L31.1 12.9 L34.2 13.2 L37.2 13.8 L39.9 14.1 L42.3 13.8 L44.4 12.6 L46.4 10.8 L48.5 8.6 L50.8 6.5 L53.3 5.0Z';

/** Sage seal with a check that pops in: the moment something is done (Cooked!). */
export function SuccessBurst({ accessibilityLabel, size: kind = 'md', haptic }: SuccessBurstProps) {
  const styles = useStyles();
  const seal = useSharedValue(0);
  const check = useSharedValue(0.6);
  const third = duration.pop * 0.4;
  useEffect(() => {
    if (!haptic) return;
    const t = setTimeout(haptics.success, duration.press + duration.pop - third);
    return () => clearTimeout(t);
  }, [haptic, third]);
  useEffect(() => {
    seal.set(withTiming(1, pop()));
    check.set(
      withDelay(
        duration.press,
        withSequence(
          withTiming(1.18, { duration: duration.pop - third, easing: easeSwing, reduceMotion: ReduceMotion.System }),
          withTiming(1, { duration: third, easing: easeSwing, reduceMotion: ReduceMotion.System }),
        ),
        ReduceMotion.System,
      ),
    );
  }, [seal, check, third]);
  const sealStyle = useAnimatedStyle(() => {
    const p = seal.get();
    return { opacity: Math.min(1, p * 1.5), transform: [{ rotate: `${-60 * (1 - p)}deg` }, { scale: 0.4 + 0.6 * p }] };
  });
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: check.get() }] }));

  return (
    <View style={[styles.root, kind === 'sm' ? styles.small : null]} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[styles.layer, kind === 'sm' ? styles.small : null, sealStyle]}>
        <Svg width="100%" height="100%" viewBox="-2 -2 118 118">
          <G transform="translate(5 5)">
            <Path d={SEAL} fill={art.ink} />
          </G>
          <Path d={SEAL} fill={art.sage} stroke={art.ink} strokeWidth={border.strong + 1} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={checkStyle}>
        <Icon name="check" size={kind === 'sm' ? 'xl' : 'hero'} color="onTint" />
      </Animated.View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  root: { width: size.burst, height: size.burst, alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', top: 0, left: 0, width: size.burst, height: size.burst },
  small: { width: size.burstSm, height: size.burstSm },
}));
