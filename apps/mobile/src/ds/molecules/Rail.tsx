import { Children, isValidElement, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { enter, exit, reflow } from '../motion';
import { createStyles } from '../theme';
import { layout, space } from '../tokens';

export interface RailProps {
  /** Keyed cards. */
  children: ReactNode;
  accessibilityLabel?: string;
  /** Width of each card (e.g. `size.upNextCard`): the rail then snaps card by card to the 20 pt margin. */
  itemWidth?: number;
}

/**
 * Cards side by side, scrolling edge to edge; the first card sits on the 20 pt margin and cards snap to it.
 * Cards are as tall as the tallest. One added or removed while it is on screen fades in or out and the others
 * slide into place; the cards it opens with are just there.
 */
export function Rail({ children, accessibilityLabel, itemWidth }: RailProps) {
  const styles = useStyles();
  const cards = Children.toArray(children).filter(isValidElement);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemWidth ? itemWidth + space.md : undefined}
      snapToAlignment="start"
      style={styles.bleed}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
    >
      <LayoutAnimationConfig skipEntering>
        {cards.map((card, i) => (
          // A row, so the card inside stretches to the rail's height (cards as tall as the tallest).
          <Animated.View key={card.key ?? i} style={styles.cell} entering={enter()} exiting={exit()} layout={reflow()}>
            {card}
          </Animated.View>
        ))}
      </LayoutAnimationConfig>
    </ScrollView>
  );
}

const useStyles = createStyles(() => ({
  bleed: { marginHorizontal: -layout.screenMargin, flexGrow: 0 },
  row: { paddingHorizontal: layout.screenMargin, gap: space.md },
  cell: { flexDirection: 'row' },
}));
