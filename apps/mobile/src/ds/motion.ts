import { Easing, ReduceMotion, type WithTimingConfig } from 'react-native-reanimated';

import { duration } from './tokens';

/** Ease-out by default; every animation respects the system "Reduce motion" setting. */
export const easeOut = Easing.out(Easing.cubic);
/** Overshoots a little, then settles: success moments and stickers only. */
export const easeSwing = Easing.bezier(0.34, 1.56, 0.64, 1);

export function timing(kind: keyof typeof duration): WithTimingConfig {
  return { duration: duration[kind], easing: easeOut, reduceMotion: ReduceMotion.System };
}

/** The overshooting entrance of stickers and the success seal (500 ms). */
export function pop(): WithTimingConfig {
  return { duration: duration.pop, easing: easeSwing, reduceMotion: ReduceMotion.System };
}
