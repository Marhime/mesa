import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../atoms/IconButton';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { layout, size, space } from '../tokens';

export interface TopBarProps {
  title?: string;
  onBack?: () => void;
  /** chevron for pushed screens, close (×) for modals. */
  backIcon?: 'back' | 'close';
  backLabel?: string;
  /** Trailing IconButtons. */
  actions?: ReactNode;
  /** Floats over a hero image: transparent, buttons get a raised disc. */
  floating?: boolean;
}

/** Back chevron + title + actions. */
export function TopBar({ title, onBack, backIcon = 'back', backLabel, actions, floating }: TopBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, floating ? [styles.floating, { top: insets.top }] : null]}>
      <View style={styles.side}>
        {onBack ? (
          <IconButton
            icon={backIcon}
            variant={floating ? 'float' : 'plain'}
            accessibilityLabel={backLabel ?? (backIcon === 'close' ? 'Close' : 'Back')}
            onPress={onBack}
          />
        ) : null}
      </View>
      <View style={styles.title}>
        {title ? (
          <Text variant="heading" align="center" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.actions]}>{actions}</View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  bar: {
    minHeight: size.touch + space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    // 8 + the 12 pt inset of a 20 pt glyph in a 44 pt button = icons on the 20 pt margin.
    paddingHorizontal: space.sm,
    gap: space.sm,
  },
  floating: { position: 'absolute', left: 0, right: 0, zIndex: 2, paddingHorizontal: layout.screenMargin },
  side: { minWidth: size.touch, flexDirection: 'row', alignItems: 'center' },
  actions: { justifyContent: 'flex-end', gap: space.sm },
  title: { flex: 1 },
}));
