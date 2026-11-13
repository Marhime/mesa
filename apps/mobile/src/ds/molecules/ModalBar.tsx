import type { ReactNode } from 'react';
import { View } from 'react-native';

import { IconButton } from '../atoms/IconButton';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { layout, space } from '../tokens';

export interface ModalBarProps {
  onClose: () => void;
  /** Spoken label of the × (default "Close"). */
  closeLabel?: string;
  /** The screen's name on the left, like a Sheet title ("Ask Mesa"). */
  title?: string;
  /** A small control before the × ("New"), like a Sheet's. */
  action?: ReactNode;
}

/**
 * The top of a screen that covers the app (the share screen, Ask Mesa): the title on the left, the ×
 * on the right, with the same sizes and places as a Sheet's header, so closing looks and works the same
 * everywhere.
 */
export function ModalBar({ onClose, closeLabel = 'Close', title, action }: ModalBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar}>
      <View style={styles.title}>
        {title ? (
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
      <IconButton icon="close" variant="plain" accessibilityLabel={closeLabel} onPress={onClose} />
    </View>
  );
}

const useStyles = createStyles(() => ({
  // Same edges as a Sheet header: the title on the content margin, the × on a Sheet's right edge.
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingLeft: layout.screenMargin,
    paddingRight: layout.screenMargin - space.md,
    paddingTop: space.sm,
  },
  title: { flex: 1, paddingTop: space.sm },
  action: { paddingTop: space.xs },
}));
