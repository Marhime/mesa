import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { createStyles } from '../theme';
import { layout, size, space } from '../tokens';

export interface ChipRowProps {
  children: ReactNode;
  /** Wrap onto several lines instead of scrolling sideways. */
  wrap?: boolean;
  accessibilityLabel?: string;
}

/** A row of chips. Scrolls edge to edge, while the first chip stays on the 20 pt margin. */
export function ChipRow({ children, wrap, accessibilityLabel }: ChipRowProps) {
  const styles = useStyles();
  if (wrap) {
    return (
      <View style={styles.wrap} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
  row: {
    paddingHorizontal: layout.screenMargin,
    gap: space.sm,
    alignItems: 'center',
    minHeight: size.touch,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
}));
