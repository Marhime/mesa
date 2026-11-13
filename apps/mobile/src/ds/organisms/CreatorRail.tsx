import { View } from 'react-native';

import { Avatar } from '../atoms/Avatar';
import { Stack } from '../atoms/Stack';
import { Tag } from '../atoms/Tag';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { Rail } from '../molecules/Rail';
import { SectionHeader } from '../molecules/SectionHeader';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface CreatorRailProps {
  /** `badge`: what they posted since anyone looked ("2 new"). */
  creators: { key: string; name: string; badge?: string }[];
  /** Opens their latest recipes. */
  onOpen: (key: string) => void;
}

/** "Your creators" in Recipes: one pill per creator the household follows ("2 new" on it). Nothing when it follows none. */
export function CreatorRail({ creators, onOpen }: CreatorRailProps) {
  const styles = useStyles();
  if (creators.length === 0) return null;
  return (
    <Stack gap="md">
      <SectionHeader title="Your creators" />
      <Rail accessibilityLabel="Your creators">
        {creators.map((c) => (
          <Touchable
            key={c.key}
            onPress={() => onOpen(c.key)}
            feedback="scale"
            accessibilityLabel={[c.name, c.badge].filter(Boolean).join(', ')}
            accessibilityHint="Shows their latest recipes"
            style={[styles.pill, c.badge ? styles.withBadge : null]}
          >
            <Avatar name={c.name} />
            <View style={styles.name}>
              <Text variant="label" numberOfLines={1}>
                {c.name}
              </Text>
            </View>
            {c.badge ? (
              <View style={styles.badge}>
                <Tag variant="ink" label={c.badge} />
              </View>
            ) : null}
          </Touchable>
        ))}
      </Rail>
    </Stack>
  );
}

const useStyles = createStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: size.creatorPill,
    paddingVertical: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.lg,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceRaised,
  },
  // The tag is a pill too: it sits as close to the edge as the avatar does.
  withBadge: { paddingRight: space.md },
  name: { flexShrink: 1 },
  // Centered on the avatar, and never squeezed by a long name.
  badge: { flexShrink: 0 },
}));
