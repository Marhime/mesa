import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../atoms/IconButton';
import { Text } from '../atoms/Text';
import { useScreenScroll } from '../screenScroll';
import { createStyles } from '../theme';
import { border, layout, size, space } from '../tokens';

export interface TopBarProps {
  title?: string;
  /** The back chevron of a pushed screen (a modal screen has a ModalBar, its × on the right). */
  onBack?: () => void;
  backLabel?: string;
  /** Trailing IconButtons. */
  actions?: ReactNode;
  /**
   * Floats over a hero image: transparent, buttons get a raised disc. Once the image has scrolled
   * away, the bar fills in with the surface, a hairline and the title.
   */
  floating?: boolean;
  /** Height of the image a floating bar sits on (default: the recipe hero). */
  heroHeight?: number;
}

const BAR_HEIGHT = size.touch + space.lg;

/** Back chevron + title + actions, for pushed screens. */
export function TopBar({ title, onBack, backLabel, actions, floating, heroHeight = size.dishHero }: TopBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const scroll = useScreenScroll();
  const still = useSharedValue(0);
  const y = scroll ?? still;
  // Solid once the image's bottom edge passes under the bar; fades in over the last 44 pt.
  const solidAt = heroHeight - insets.top - BAR_HEIGHT;
  const fill = useAnimatedStyle(() => ({
    opacity: floating ? interpolate(y.get(), [solidAt - size.touch, solidAt], [0, 1], Extrapolation.CLAMP) : 1,
  }));

  return (
    <View style={[styles.bar, floating ? [styles.floating, { top: insets.top }] : null]}>
      {floating ? (
        <Animated.View style={[styles.fill, { top: -insets.top }, fill]} pointerEvents="none" />
      ) : null}
      <View style={styles.side}>
        {onBack ? (
          <IconButton icon="back" variant={floating ? 'float' : 'plain'} accessibilityLabel={backLabel ?? 'Back'} onPress={onBack} />
        ) : null}
      </View>
      <Animated.View style={[styles.title, floating ? fill : null]}>
        {title ? (
          <Text
            variant="heading"
            align="center"
            numberOfLines={1}
            // Over a hero, the page's own large title is the header; this one only appears on scroll.
            accessibilityRole={floating ? undefined : 'header'}
            accessible={!floating}
          >
            {title}
          </Text>
        ) : null}
      </Animated.View>
      <View style={[styles.side, styles.actions]}>{actions}</View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  bar: {
    minHeight: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    // 8 + the 12 pt inset of a 20 pt glyph in a 44 pt button = icons on the 20 pt margin.
    paddingHorizontal: space.sm,
    gap: space.sm,
  },
  floating: { position: 'absolute', left: 0, right: 0, zIndex: 2, paddingHorizontal: layout.screenMargin },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.colors.surface,
    borderBottomWidth: border.hairline,
    borderBottomColor: t.colors.line,
  },
  side: { minWidth: size.touch, flexDirection: 'row', alignItems: 'center' },
  actions: { justifyContent: 'flex-end', gap: space.sm },
  title: { flex: 1 },
}));
