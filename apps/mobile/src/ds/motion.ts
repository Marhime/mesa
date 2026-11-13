import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  FadeOutUp,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { duration, spring } from './tokens';

// Fast and the same everywhere: the finger shows at once (50 ms; letting go eases back in 100 ms), things arrive
// in 200 ms and leave in 150 ms, sheets spring open in 380 ms and close in 200 ms, success takes 400 ms. Ease-out
// by default; every animation respects the system "Reduce motion" setting.

/** Ease-out by default; every animation respects the system "Reduce motion" setting. */
export const easeOut = Easing.out(Easing.cubic);
/** Overshoots a little, then settles: success moments and stickers only. */
export const easeSwing = Easing.bezier(0.34, 1.56, 0.64, 1);

export function timing(kind: keyof typeof duration): WithTimingConfig {
  return { duration: duration[kind], easing: easeOut, reduceMotion: ReduceMotion.System };
}

/**
 * Opacity or colour only (a glow, a pulse): nothing moves, so it plays even with "Reduce motion"
 * on, where hiding it would hide information (the "just added" glow, the loading pulse).
 */
export function fade(kind: keyof typeof duration): WithTimingConfig {
  return { duration: duration[kind], easing: easeOut, reduceMotion: ReduceMotion.Never };
}

/** The overshooting entrance of stickers and the success seal (400 ms). */
export function pop(): WithTimingConfig {
  return { duration: duration.pop, easing: easeSwing, reduceMotion: ReduceMotion.System };
}

export function springTo(kind: keyof typeof spring): WithSpringConfig {
  return { ...spring[kind], reduceMotion: ReduceMotion.System };
}

// Layout animations shared by every list, so rows arrive, leave and make room the same way everywhere.

/** A row or section appearing (200 ms fade). */
export function enter(delay = 0) {
  return FadeIn.duration(duration.small).delay(delay).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** A row or section leaving (150 ms fade). */
export function exit() {
  return FadeOut.duration(duration.leave).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** Neighbours sliding into the space a row left or needs (200 ms, ease-out). */
export function reflow() {
  return LinearTransition.duration(duration.small).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** Rising into place from a little below (footers, toasts, staggered success content). */
export function rise(delay = 0) {
  return FadeInDown.duration(duration.small).delay(delay).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** Sinking away (footers, bottom toasts). */
export function sink() {
  return FadeOutDown.duration(duration.leave).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** Dropping in from above (toasts shown at the top, over a sheet). */
export function drop() {
  return FadeInUp.duration(duration.small).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** Lifting away (top toasts). */
export function lift() {
  return FadeOutUp.duration(duration.leave).easing(easeOut).reduceMotion(ReduceMotion.System);
}

/** Content swapping in place (another idea, the Mesa button): new in over 200 ms, old out over 100 ms. */
export function swapIn() {
  return FadeIn.duration(duration.small).easing(easeOut).reduceMotion(ReduceMotion.Never);
}

export function swapOut() {
  return FadeOut.duration(duration.press).easing(easeOut).reduceMotion(ReduceMotion.Never);
}

/**
 * A mark switching on (an ingredient's ✓): it settles in from a touch smaller, 150 ms. Only on a change:
 * wrap it in `LayoutAnimationConfig skipEntering` so a list doesn't pop as it opens.
 */
export function markIn() {
  return new Keyframe({
    0: { opacity: 0, transform: [{ scale: 0.8 }] },
    100: { opacity: 1, transform: [{ scale: 1 }], easing: easeOut },
  })
    .duration(duration.mark)
    .reduceMotion(ReduceMotion.System);
}
