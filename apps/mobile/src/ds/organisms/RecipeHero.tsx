import type { ReactNode } from 'react';
import { View } from 'react-native';

import { createStyles } from '../theme';
import { layout, radius, space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface RecipeHeroProps {
  imageUrl: string | null;
  /** Picks the stand-in illustration when there is no photo (the recipe id). */
  seed: string;
  /** The recipe's header: source, title, key numbers. */
  children: ReactNode;
}

/** Full-bleed photo, with the recipe's header on a rounded panel that overlaps it. */
export function RecipeHero({ imageUrl, seed, children }: RecipeHeroProps) {
  const styles = useStyles();
  return (
    <View>
      <RecipeCover uri={imageUrl} seed={seed} shape="hero" />
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
