import { View } from 'react-native';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  text?: string;
  action?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
  /** Error states use a sunken disc instead of the lime one. */
  tone?: 'default' | 'error';
}

/** Icon on a lime disc, title, text, one way forward. Also used for error states. */
export function EmptyState({ icon, title, text, action, tone = 'default' }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <View style={[styles.disc, tone === 'error' ? styles.discError : null]}>
        <Icon name={icon} size="xl" color={tone === 'error' ? 'danger' : 'onTint'} />
      </View>
      <View style={styles.text}>
        <Text variant="heading" align="center" accessibilityRole="header">
          {title}
        </Text>
        {text ? (
          <Text variant="body" color="inkMuted" align="center">
            {text}
          </Text>
        ) : null}
      </View>
      {action ? <Button label={action.label} onPress={action.onPress} variant={action.variant ?? 'secondary'} /> : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  root: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxxl, paddingHorizontal: space.lg },
  disc: {
    width: size.emptyDisc,
    height: size.emptyDisc,
    borderRadius: radius.full,
    backgroundColor: t.colors.select,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discError: { backgroundColor: t.colors.dangerSoft },
  text: { gap: space.xs, maxWidth: size.readable },
}));
