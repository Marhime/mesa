import { View } from 'react-native';
import type { Category } from '@mesa/shared';

import { FoodPicto } from '../atoms/FoodPicto';
import { SegmentBar } from '../atoms/SegmentBar';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles, useTheme } from '../theme';
import { radius, space } from '../tokens';

export interface PantryTileProps {
  name: string;
  category: Category;
  /** "500 g", "About half", "Almost out". */
  amount: string;
  /** Almost out: the amount turns red. */
  low?: boolean;
  /** How much is left, in quarters (0–4). */
  quarters: number;
  onPress?: () => void;
}

/** Something at home: picto, name, how much is left. */
export function PantryTile({ name, category, amount, low, quarters, onPress }: PantryTileProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      disabled={!onPress}
      feedback="highlight"
      highlightFrom={theme.colors.surfaceRaised}
      highlightTo={theme.colors.surfaceSunken}
      accessibilityLabel={`${name}, ${amount}`}
      accessibilityHint={onPress ? 'Change how much is left' : undefined}
      style={styles.tile}
    >
      <FoodPicto category={category} />
      <View style={styles.text}>
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant={low ? 'captionStrong' : 'caption'} color={low ? 'danger' : 'inkMuted'} numberOfLines={1}>
          {amount}
        </Text>
      </View>
      <SegmentBar total={4} filled={quarters} />
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  tile: { gap: space.sm, padding: space.lg, borderRadius: radius.lg },
  text: { gap: space.xs / 2 },
}));
