import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springTo } from './motion';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A selection pill that slides from one item to the next (tab bar, segmented control) instead of
 * jumping. Put the indicator (absolutely positioned at 0,0, `indicatorStyle`) and the items in the same
 * unpadded, borderless row, and give each item `onLayout={onItemLayout(i)}`.
 */
export function useSlidingIndicator(activeIndex: number) {
  const boxes = useRef<Box[]>([]);
  const active = useRef(activeIndex);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const place = (box: Box, animate: boolean) => {
    if (animate) {
      x.set(withSpring(box.x, springTo('indicator')));
      width.set(withSpring(box.width, springTo('indicator')));
    } else {
      x.set(box.x);
      width.set(box.width);
    }
    y.set(box.y);
    height.set(box.height);
  };

  useEffect(() => {
    if (active.current === activeIndex) return;
    active.current = activeIndex;
    const box = boxes.current[activeIndex];
    if (box) place(box, true);
    // place only reads shared values and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const onItemLayout = (index: number) => (e: LayoutChangeEvent) => {
    const box = e.nativeEvent.layout;
    boxes.current[index] = box;
    // First layout, rotation, Dynamic Type: follow at once, no slide.
    if (index === active.current) place(box, false);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: width.get() > 0 ? 1 : 0,
    width: width.get(),
    height: height.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  return { onItemLayout, indicatorStyle };
}
