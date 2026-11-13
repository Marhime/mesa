import { View } from 'react-native';

import { Avatar } from '../atoms/Avatar';
import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles } from '../theme';
import { size, space } from '../tokens';

export interface CreatorLinkProps {
  /** The creator, for the avatar; null when the source does not say (a play glyph then). */
  name: string | null;
  /** "More from Food is Love", "By Food is Love". */
  label: string;
  /** Shows their latest recipes; without it the line is only a credit. */
  onPress?: () => void;
}

/** Who made a recipe, under its title: a credit, or a way to their latest recipes. */
export function CreatorLink({ name, label, onPress }: CreatorLinkProps) {
  const styles = useStyles();
  const content = (
    <>
      {name ? <Avatar name={name} size="sm" /> : <Icon name="play" color="inkMuted" />}
      <Text variant="label" numberOfLines={1} flex>
        {label}
      </Text>
      {onPress ? <Icon name="chevron" size="sm" color="inkMuted" /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Touchable onPress={onPress} accessibilityLabel={label} accessibilityHint="Shows their latest recipes" style={styles.row}>
      {content}
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.touch },
}));
