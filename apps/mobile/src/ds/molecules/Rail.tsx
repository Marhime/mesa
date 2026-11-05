import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { createStyles } from '../theme';
import { layout, space } from '../tokens';

export interface RailProps {
  children: ReactNode;
  accessibilityLabel?: string;
}

/** Cards side by side, scrolling edge to edge; the first card sits on the 20 pt margin and cards snap to it. */
export function Rail({ children, accessibilityLabel }: RailProps) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToAlignment="start"
      style={styles.bleed}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </ScrollView>
  );
}

const useStyles = createStyles(() => ({
  bleed: { marginHorizontal: -layout.screenMargin, flexGrow: 0 },
  row: { paddingHorizontal: layout.screenMargin, gap: space.md },
}));
