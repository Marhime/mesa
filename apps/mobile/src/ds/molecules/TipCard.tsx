import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { enter, exit } from '../motion';
import { createStyles } from '../theme';
import { radius, space } from '../tokens';

export interface TipCardProps {
  title: string;
  text?: string;
  /** Short numbered steps ("Tap Share on the post"). */
  steps?: string[];
  icon?: IconName;
  onDismiss: () => void;
  dismissLabel?: string;
}

/**
 * A one-time explanation that stays until dismissed ("Got it": read, hide it): how to save from Instagram,
 * whose kitchen this is. It fades away when dismissed (and in, should it come while the screen is open).
 */
export function TipCard({ title, text, steps, icon = 'sparkle', onDismiss, dismissLabel = 'Got it' }: TipCardProps) {
  const styles = useStyles();
  return (
    <Animated.View style={styles.card} entering={enter()} exiting={exit()}>
      <View style={styles.head} accessible accessibilityRole="summary">
        <Icon name={icon} />
        <View style={styles.body}>
          <Text variant="label">{title}</Text>
          {text ? (
            <Text variant="body" color="inkMuted">
              {text}
            </Text>
          ) : null}
          {steps?.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text variant="label" color="inkMuted">
                {`${i + 1}.`}
              </Text>
              <Text variant="body" flex>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Button label={dismissLabel} variant="ghost" onPress={onDismiss} accessibilityHint="Hides this tip" />
      </View>
    </Animated.View>
  );
}

const useStyles = createStyles((t) => ({
  card: { backgroundColor: t.colors.surfaceSunken, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  body: { flex: 1, gap: space.xs },
  step: { flexDirection: 'row', gap: space.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
}));
