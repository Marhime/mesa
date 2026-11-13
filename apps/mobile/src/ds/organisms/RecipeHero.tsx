import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';

import { useScreenScroll } from '../screenScroll';
import { createStyles } from '../theme';
import { gesture, layout, radius, size, space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface RecipeHeroProps {
  imageUrl: string | null;
  /** Picks the stand-in illustration when there is no photo (the recipe id). */
  seed: string;
  /** The recipe's header: source, title, key numbers. */
  children: ReactNode;
}

/**
 * Full-bleed photo, with the recipe's header on a rounded panel that overlaps it. Pulling down
 * stretches the photo (no bare surface above it); scrolling up, it drifts at half speed under the panel.
 */
export function RecipeHero({ imageUrl, seed, children }: RecipeHeroProps) {
  const styles = useStyles();
  const scroll = useScreenScroll();
  const still = useSharedValue(0);
  const y = scroll ?? still;
  const reduced = useReducedMotion();
  const photo = useAnimatedStyle(() => {
    const offset = y.get();
    if (offset < 0) {
      // Grow by the pull and keep the top edge pinned to the screen top.
      return { transform: [{ translateY: offset / 2 }, { scale: 1 - offset / size.dishHero }] };
    }
    return { transform: [{ translateY: reduced ? 0 : offset * gesture.parallax }, { scale: 1 }] };
  });

  return (
    <View>
      <Animated.View style={photo}>
        <RecipeCover uri={imageUrl} seed={seed} shape="hero" />
      </Animated.View>
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  panel: {
    marginTop: -radius.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: t.colors.surface,
    paddingTop: space.xxl,
    paddingHorizontal: layout.screenMargin,
    gap: space.lg,
  },
}));
