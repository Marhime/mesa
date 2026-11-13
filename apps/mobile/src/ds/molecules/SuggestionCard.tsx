import { View } from 'react-native';

import { Button } from '../atoms/Button';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, space } from '../tokens';
import { Meta } from './Meta';

export interface SuggestionCardProps {
  title: string;
  /** "25 min", next to the title. */
  minutes?: string | null;
  /** One line on why it fits. */
  why?: string | null;
  /** Short facts under it ("Uses tomato and crema", "To buy onion"); empty ones are left out. */
  details?: (string | null)[];
  action: { label: string; icon?: IconName; onPress: () => void; accessibilityHint?: string };
}

/** A dish suggested by Mesa, not a saved recipe: a sunken card with why it fits and one way forward. */
export function SuggestionCard({ title, minutes, why, details = [], action }: SuggestionCardProps) {
  const styles = useStyles();
  const lines = details.filter((d): d is string => !!d);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="heading" flex>
          {title}
        </Text>
        {minutes ? <Meta icon="clock" text={minutes} /> : null}
      </View>
      {why ? <Text variant="body">{why}</Text> : null}
      {lines.map((line) => (
        <Text key={line} variant="caption" color="inkMuted">
          {line}
        </Text>
      ))}
      <View style={styles.action}>
        <Button
          label={action.label}
          iconStart={action.icon}
          variant="secondary"
          fullWidth
          onPress={action.onPress}
          accessibilityLabel={`${action.label}: ${title}`}
          accessibilityHint={action.accessibilityHint}
        />
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  card: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: t.colors.surfaceSunken },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  action: { paddingTop: space.sm },
}));
