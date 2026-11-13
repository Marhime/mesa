import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import { createStyles } from '../theme';
import { aspect as ratios, duration, radius as radii, size } from '../tokens';
import { DishArt } from './DishArt';

export interface RecipeCoverProps {
  uri: string | null;
  /**
   * card: 16:10 rounded · hero: full-bleed, 300 high · banner: 176 high (Tonight's idea) ·
   * tile: 104 high (On the menu) · thumb: 64 pt square · video: a small 16:9 video thumbnail (creator sheet) ·
   * videoCard: 16:9 across its card, square corners (the card rounds them: New from your creators).
   */
  shape?: 'card' | 'hero' | 'banner' | 'tile' | 'thumb' | 'video' | 'videoCard';
  /** Without a photo, an illustration picked from this (the recipe id); otherwise a bowl icon. */
  seed?: string;
  accessibilityLabel?: string;
}

/** Recipe photo, or a stand-in illustration when there is none (or it fails to load). */
export function RecipeCover({ uri, shape = 'card', seed, accessibilityLabel }: RecipeCoverProps) {
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const showImage = uri && !failed;
  const small = shape === 'thumb' || shape === 'video';
  return (
    <View style={[styles.base, styles[shape]]} accessible={!!accessibilityLabel} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {showImage ? (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          transition={duration.small}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          accessible={false}
        />
      ) : seed && !small ? (
        <View style={styles.image}>
          <DishArt seed={seed} />
        </View>
      ) : (
        <Icon name="bowl" size={small ? 'lg' : 'xl'} color="inkMuted" weight="duotone" />
      )}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  base: { backgroundColor: t.colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: { width: '100%', aspectRatio: ratios.recipeCard, borderRadius: radii.lg },
  hero: { width: '100%', height: size.dishHero },
  banner: { width: '100%', height: size.dishBanner },
  tile: { width: '100%', height: size.dishTile },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radii.sm },
  video: { width: size.videoThumb, aspectRatio: ratios.video, borderRadius: radii.sm },
  videoCard: { width: '100%', aspectRatio: ratios.video },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
}));
