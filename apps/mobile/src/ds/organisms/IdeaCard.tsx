import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '../atoms/Button';
import { IconButton } from '../atoms/IconButton';
import { Sticker } from '../atoms/Sticker';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { Meta } from '../molecules/Meta';
import { reflow, swapIn, swapOut } from '../motion';
import { createStyles } from '../theme';
import { radius, space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface IdeaCardProps {
  /** Small line above the title ("Tonight's idea"). */
  overline: string;
  title: string;
  /** Why this one ("Uses your avocados and crema before they turn."). */
  text?: string;
  imageUrl: string | null;
  seed: string;
  /** Sticker on the photo ("Uses 3 things you have"). */
  sticker?: string;
  minutes?: string;
  /** "2 to buy", "All at home". */
  shopping: string;
  actionLabel: string;
  onAction: () => void;
  onPress: () => void;
  onAnother?: () => void;
  /** Plan it: on the menu (the `add` haptic at the touch). */
  onPlan: () => void;
}

/**
 * The featured suggestion: a raised card with the dish, why it fits, and what to do now (cook it, plan it).
 * "Another idea" crossfades the dish (keyed by `seed`) with a selection tick.
 */
export function IdeaCard({
  overline,
  title,
  text,
  imageUrl,
  seed,
  sticker,
  minutes,
  shopping,
  actionLabel,
  onAction,
  onPress,
  onAnother,
  onPlan,
}: IdeaCardProps) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Touchable onPress={onPress} feedback="scale" accessibilityLabel={`${overline}: ${title}`} accessibilityHint="Opens the recipe">
        <Animated.View key={seed} entering={swapIn()} exiting={swapOut()}>
          <RecipeCover uri={imageUrl} seed={seed} shape="banner" />
          {sticker ? (
            <View style={styles.sticker} pointerEvents="none">
              <Sticker label={sticker} icon="sparkle" />
            </View>
          ) : null}
          <View style={styles.head}>
            <Text variant="overline" color="inkMuted">
              {overline}
            </Text>
            <Text variant="title" color="ink" accessibilityRole="header">
              {title}
            </Text>
            {text ? (
              <Text variant="body" color="inkMuted">
                {text}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </Touchable>
      <Animated.View style={styles.body} layout={reflow()}>
        <View style={styles.meta}>
          {minutes ? <Meta icon="clock" text={minutes} /> : null}
          <Meta icon="store" text={shopping} />
        </View>
        <View style={styles.actions}>
          <View style={styles.primary}>
            <Button label={actionLabel} fullWidth onPress={onAction} />
          </View>
          {onAnother ? (
            <IconButton icon="another" accessibilityLabel="Another idea" haptic="select" onPress={onAnother} />
          ) : null}
          <IconButton icon="plan" accessibilityLabel="Plan it" accessibilityHint="Puts it on the menu, and what's missing on your list" haptic="add" onPress={onPlan} />
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  card: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: t.colors.surfaceRaised },
  sticker: { position: 'absolute', top: space.lg, left: space.lg },
  head: { gap: space.xs, paddingHorizontal: space.xl, paddingTop: space.xl },
  body: { gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xl },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: { flex: 1 },
}));
