import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { usePanGesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { springTo } from '../motion';
import { gesture } from '../tokens';

/**
 * Drag a sheet down to close it: by its handle and header at any time, by its content once that is
 * scrolled to the top. Past a quarter of its height, or flicked, it closes; otherwise it springs back.
 *
 * `progress` is how open the sheet is (1 = open, 0 = `travel` pt down). A dismiss hands the dragged
 * distance over to `progress`, so the closing slide continues from under the finger. While `held`
 * (unsaved changes), a dismiss springs back into place instead and still calls `onClose`, which asks.
 */
export function useSheetDrag(progress: SharedValue<number>, travel: number, onClose: () => void, held: SharedValue<boolean>) {
  const drag = useSharedValue(0);
  const height = useSharedValue(0);
  const atTop = useSharedValue(true);
  const base = useSharedValue(0);

  const pan = (followsScroll: boolean) => ({
    activeOffsetY: [-gesture.activeOffset, gesture.activeOffset] as [number, number],
    failOffsetX: [-gesture.failOffset, gesture.failOffset] as [number, number],
    onActivate: () => {
      'worklet';
      base.set(0);
    },
    onUpdate: (e: { translationY: number }) => {
      'worklet';
      // While the content still scrolls, the drag starts from wherever the finger is when it reaches the top.
      if (followsScroll && !atTop.get() && drag.get() === 0) {
        base.set(e.translationY);
        return;
      }
      drag.set(Math.max(0, e.translationY - base.get()));
    },
    onDeactivate: (e: { velocityY: number }) => {
      'worklet';
      const d = drag.get();
      if (d <= 0) return;
      const dismissed = d > height.get() * gesture.dismissFraction || e.velocityY > gesture.dismissVelocity;
      if (dismissed && !held.get()) {
        progress.set(Math.max(0, 1 - d / travel));
        drag.set(0);
      } else {
        drag.set(withSpring(0, springTo('sheet')));
      }
      if (dismissed) scheduleOnRN(onClose);
    },
  });

  const handle = usePanGesture(pan(false));
  const content = usePanGesture(pan(true));

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.get()) * travel + drag.get() }] }));

  return {
    /** For the handle and header. */
    handle,
    /** For the scrolling content (also pass it to the ScrollView's `simultaneousWith`). */
    content,
    /** The sheet's slide: open/close plus the drag. */
    style,
    onLayout: (e: LayoutChangeEvent) => height.set(e.nativeEvent.layout.height),
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => atTop.set(e.nativeEvent.contentOffset.y <= 0),
  };
}
