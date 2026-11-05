import { View } from 'react-native';
import type { Category } from '@mesa/shared';

import { FoodPicto } from '../atoms/FoodPicto';
import { Meter } from '../atoms/Meter';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles, tintColor } from '../theme';
import { radius, size, space } from '../tokens';

export interface UseSoonCardProps {
  name: string;
  category: Category;
  /** "Today", "2 days". */
  when: string;
  /** Today or past: the label is emphasized. */
  urgent?: boolean;
  /** Share of its shelf life left, 0–1. */
  freshness: number;
  onPress?: () => void;
}

/** Food to use soon, on its category pastel: picto, name, time left, a freshness bar. */
export function UseSoonCard({ name, category, when, urgent, freshness, onPress }: UseSoonCardProps) {
  const styles = useStyles();
  return (
    <Touchable
      onPress={onPress}
      disabled={!onPress}
      feedback="scale"
      accessibilityLabel={`${name}, use within ${when.toLowerCase()}`}
      accessibilityHint={onPress ? 'Shows recipes that use it' : undefined}
      style={[styles.card, { backgroundColor: tintColor(category) }]}
    >
      <FoodPicto category={category} size="md" />
      <View style={styles.text}>
        <Text variant="label" color="onTint" numberOfLines={1}>
          {name}
        </Text>
        <Text variant={urgent ? 'captionStrong' : 'caption'} color={urgent ? 'onTint' : 'onTintMuted'} numberOfLines={1}>
          {when}
        </Text>
      </View>
      <Meter value={freshness} />
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  card: { width: size.useSoonCard, gap: space.md, padding: space.lg, borderRadius: radius.lg },
  text: { gap: space.xs / 2 },
}));
