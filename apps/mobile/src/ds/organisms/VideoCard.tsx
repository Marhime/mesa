import { View } from 'react-native';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { PlayDisc } from '../atoms/PlayDisc';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { DismissButton } from '../molecules/DismissButton';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface VideoCardProps {
  title: string;
  /** "Food is Love · 9 min". */
  meta: string | null;
  /** Why Mesa picked it ("Like the tinga you made twice"); none for a creator's new video. */
  why?: string | null;
  thumbnail: string | null;
  /** raised: on a screen (For you, New from your creators) · sunken: inside a sheet (Ask Mesa). */
  tone?: 'raised' | 'sunken';
  /** Its import is starting. */
  saving?: boolean;
  /** Already in Recipes, or saved from here: "Saved" instead of Save. */
  saved?: boolean;
  /** Imports it as a recipe. */
  onSave: () => void;
  /** Opens the video (in-app browser). */
  onWatch: () => void;
  /** The × in the thumbnail's corner, like every card's ("Not for us", "Not now"). */
  dismiss?: { label: string; hint: string; onPress: () => void };
}

/**
 * A recipe video, the same card everywhere (For you, New from your creators, Ask Mesa): the thumbnail
 * plays it, the why says why this one, Save imports it. `size.videoCard` wide, for a Rail: cards are as
 * tall as the tallest, so Save lines up at the bottom.
 */
export function VideoCard({ title, meta, why, thumbnail, tone = 'raised', saving, saved, onSave, onWatch, dismiss }: VideoCardProps) {
  const styles = useStyles();
  return (
    <View style={[styles.card, tone === 'raised' ? styles.raised : styles.sunken]}>
      <View>
        <Touchable onPress={onWatch} feedback="scale" accessibilityLabel={`Watch ${title}`} accessibilityHint="Opens the video">
          <RecipeCover uri={thumbnail} shape="videoCard" />
          <PlayDisc />
        </Touchable>
        {dismiss ? (
          <View style={styles.dismiss}>
            <DismissButton label={dismiss.label} hint={dismiss.hint} onPress={dismiss.onPress} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.text}>
          <Text variant="label" numberOfLines={2}>
            {title}
          </Text>
          {meta ? (
            <Text variant="caption" color="inkMuted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {why ? (
            <View style={styles.why} accessible accessibilityLabel={`Why: ${why}`}>
              <Icon name="sparkle" size="sm" />
              <Text variant="caption" numberOfLines={2} flex>
                {why}
              </Text>
            </View>
          ) : null}
        </View>
        {saved ? (
          <Button label="Saved" variant="secondary" iconStart="check" fullWidth disabled onPress={onSave} accessibilityLabel={`${title}, saved`} />
        ) : (
          <Button
            label="Save"
            variant="secondary"
            fullWidth
            loading={saving}
            haptic="add"
            accessibilityLabel={`Save ${title}`}
            accessibilityHint="Mesa writes the recipe down for you"
            onPress={onSave}
          />
        )}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  // Its Rail stretches it to the tallest card: the body grows, so Save lines up at the bottom.
  card: { width: size.videoCard, borderRadius: radius.lg, overflow: 'hidden' },
  raised: { backgroundColor: t.colors.surfaceRaised },
  sunken: { backgroundColor: t.colors.surfaceSunken },
  dismiss: { position: 'absolute', top: space.sm, right: space.sm },
  body: { flex: 1, gap: space.md, padding: space.lg },
  text: { flex: 1, gap: space.xs },
  why: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: space.xs },
}));
