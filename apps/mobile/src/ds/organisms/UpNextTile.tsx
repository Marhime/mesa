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
  /** Long press: take it off the menu. Also offered to VoiceOver as the "Take off the menu" action. */
  onLongPress?: () => void;
}

/** A planned recipe in the On the menu rail: photo, name, whether everything is at home. */
export function UpNextTile({ title, imageUrl, seed, status, onPress, onLongPress }: UpNextTileProps) {
  const styles = useStyles();
  return (
    <Touchable
      onPress={onPress}
      onLongPress={onLongPress}
      feedback="scale"
      accessibilityLabel={[title, status?.text].filter(Boolean).join(', ')}
      accessibilityHint="Opens the recipe"
      accessibilityActions={onLongPress ? [{ name: 'remove', label: 'Take off the menu' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'remove') onLongPress?.();
      }}
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
  text: { gap: space.xxs, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
}));
