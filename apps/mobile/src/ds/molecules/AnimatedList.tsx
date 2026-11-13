import { Children, isValidElement, type ReactNode } from 'react';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { enter, exit, reflow } from '../motion';
import { space, type SpaceToken } from '../tokens';

export interface AnimatedListProps {
  /** Keyed items: sections of a list, cards of an inbox. */
  children: ReactNode;
  gap: SpaceToken;
  accessibilityLabel?: string;
}

/**
 * Items stacked with a gap that come and go like list rows: an item added or removed fades in or out and the
 * others slide into place. The list itself fades in when it arrives (after its skeleton) and out when it
 * empties; the items it arrives with come with it, not one by one.
 */
export function AnimatedList({ children, gap, accessibilityLabel }: AnimatedListProps) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <Animated.View style={{ gap: space[gap] }} entering={enter()} exiting={exit()} accessibilityLabel={accessibilityLabel}>
      <LayoutAnimationConfig skipEntering>
        {items.map((item, i) => (
          <Animated.View key={item.key ?? i} entering={enter()} exiting={exit()} layout={reflow()}>
            {item}
          </Animated.View>
        ))}
      </LayoutAnimationConfig>
    </Animated.View>
  );
}
