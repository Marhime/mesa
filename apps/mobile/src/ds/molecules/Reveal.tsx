import type { ReactNode } from 'react';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { enter, exit, rise, sink } from '../motion';

export interface RevealProps {
  /** Shown or not: the content rises in and sinks away instead of popping. */
  visible?: boolean;
  /**
   * ms before it rises in: staggered success content (`duration.small`, `duration.pop`…), which also plays as
   * the screen opens. Without a delay, content there as the screen opens is just there.
   */
  delay?: number;
  /** rise: comes up from a little below (default) · fade: opacity only. */
  motion?: 'rise' | 'fade';
  children: ReactNode;
}

/** Wraps content that appears and disappears (a footer action, a success line) so it moves into place. */
export function Reveal({ visible = true, delay = 0, motion = 'rise', children }: RevealProps) {
  if (!visible) return null;
  const view = (
    <Animated.View entering={motion === 'rise' ? rise(delay) : enter(delay)} exiting={motion === 'rise' ? sink() : exit()}>
      {children}
    </Animated.View>
  );
  // A staggered entrance is the point of the screen (Cooked!): it plays even as the screen opens.
  return delay > 0 ? <LayoutAnimationConfig skipEntering={false}>{view}</LayoutAnimationConfig> : view;
}
