import { View } from 'react-native';

import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { Meta } from '../molecules/Meta';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface UpNextTileProps {
  title: string;
  imageUrl: string | null;
  seed: string;
  /** "All at home" (success) or "1 to buy". */
  status?: { icon: IconName; text: string; tone: 'success' | 'muted' };
  onPress: () => void;
  /** Long press: remove from Up next. */
  onLongPress?: () => void;
}

/** A planned recipe in the Up next rail: photo, name, whether everything is at home. */
export function UpNextTile({ title, imageUrl, seed, status, onPress, onLongPress }: UpNextTileProps) {
  const styles = useStyles();
  return (
    <Touchable
      onPress={onPress}
      onLongPress={onLongPress}
      feedback="scale"
      accessibilityLabel={[title, status?.text].filter(Boolean).join(', ')}
      accessibilityHint={onLongPress ? 'Opens the recipe. Long press to remove it from Up next.' : 'Opens the recipe'}
      style={styles.tile}
    >
      <RecipeCover uri={imageUrl} seed={seed} shape="tile" />
      <View style={styles.text}>
        <Text variant="heading" numberOfLines={2}>
          {title}
        </Text>
        {status ? <Meta icon={status.icon} text={status.text} tone={status.tone} /> : null}
      </View>
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  tile: { width: size.upNextCard, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: t.colors.surfaceRaised },
  text: { gap: space.xs / 2, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
}));
