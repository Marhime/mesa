import { PlayDisc } from '../atoms/PlayDisc';
import { Tag } from '../atoms/Tag';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { CheckRow } from '../molecules/CheckRow';
import { Meta } from '../molecules/Meta';
import { createStyles } from '../theme';
import { radius } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface CreatorVideoRowProps {
  title: string;
  /** "68k views · 9 min". */
  meta: string | null;
  /** The dish, when the title says something else. */
  dish: string | null;
  thumbnail: string | null;
  /** Already in Recipes: "Saved" instead of a checkbox. */
  saved: boolean;
  checked: boolean;
  /** Can't be picked now (the limit is reached). */
  disabled?: boolean;
  onToggle: () => void;
  /** Opens the video (in-app browser). */
  onWatch: () => void;
}

/** A creator's video in their sheet: the thumbnail plays it, the rest of the row picks it. */
export function CreatorVideoRow({ title, meta, dish, thumbnail, saved, checked, disabled, onToggle, onWatch }: CreatorVideoRowProps) {
  const styles = useStyles();
  const label = [title, dish, meta].filter(Boolean).join(', ');
  return (
    <CheckRow
      checked={checked}
      onToggle={saved ? undefined : onToggle}
      done={<Tag variant="outline" icon="check" label="Saved" />}
      disabled={disabled}
      accessibilityLabel={saved ? `${label}, saved` : label}
      accessibilityActions={[{ name: 'watch', label: 'Watch', onPress: onWatch }]}
      leading={
        <Touchable onPress={onWatch} feedback="scale" accessibilityLabel={`Watch ${title}`} accessibilityHint="Opens the video" style={styles.cover}>
          <RecipeCover uri={thumbnail} shape="video" />
          <PlayDisc />
        </Touchable>
      }
    >
      <Text variant="label" numberOfLines={3}>
        {title}
      </Text>
      {dish ? <Meta icon="bowl" text={dish} /> : null}
      {meta ? (
        <Text variant="caption" color="inkMuted" numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </CheckRow>
  );
}

const useStyles = createStyles(() => ({
  cover: { borderRadius: radius.sm },
}));
