import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles } from '../theme';
import { space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface RecipeCardProps {
  title: string;
  imageUrl: string | null;
  /** Picks the illustration shown when there is no photo (the recipe id). */
  seed?: string;
  /** Caption under the title ("25 min · 4 servings"). */
  meta?: string;
  favorite?: boolean;
  onPress: () => void;
}

/** Image 16:10, title in heading, meta in caption. Flat: no shadow. */
export function RecipeCard({ title, imageUrl, seed, meta, favorite, onPress }: RecipeCardProps) {
  const styles = useStyles();
  const label = [title, favorite ? 'favorite' : null, meta].filter(Boolean).join(', ');
  return (
    <Touchable onPress={onPress} feedback="scale" accessibilityLabel={label} style={styles.card}>
      <RecipeCover uri={imageUrl} seed={seed} shape="card" />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text variant="heading" numberOfLines={2} flex>
            {title}
          </Text>
          {favorite ? <Icon name="favorite" size="sm" weight="fill" color="ink" /> : null}
        </View>
        {meta ? (
          <Text variant="caption" color="inkMuted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  card: { gap: space.sm },
  text: { gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
}));
