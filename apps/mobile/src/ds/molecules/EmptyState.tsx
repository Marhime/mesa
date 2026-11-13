import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import type { HapticKind } from '../haptics';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface EmptyStateProps {
  /** Shown on a sunken disc (screen size only). */
  icon?: IconName;
  /** Drawn instead of the disc: the success seal of a finished list ("All put away"). */
  art?: ReactNode;
  title: string;
  text?: string;
  action?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; haptic?: HapticKind };
  /** Error states use a danger disc. */
  tone?: 'default' | 'error';
  /** screen: centered, with its disc (default) · section: a quiet left-aligned note inside a section, its action full width. */
  size?: 'screen' | 'section';
}

/** Icon on a quiet disc, title, text, one way forward. Also used for error states. */
export function EmptyState({ icon, art, title, text, action, tone = 'default', size: kind = 'screen' }: EmptyStateProps) {
  const styles = useStyles();
  const section = kind === 'section';
  const align = section ? 'left' : 'center';
  return (
    <View style={section ? styles.section : styles.root}>
      {section ? null : art ? (
        art
      ) : icon ? (
        <View style={[styles.disc, tone === 'error' ? styles.discError : null]}>
          <Icon name={icon} size="xl" color={tone === 'error' ? 'danger' : 'ink'} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant={section ? 'label' : 'heading'} align={align} accessibilityRole="header">
          {title}
        </Text>
        {text ? (
          <Text variant="body" color="inkMuted" align={align}>
            {text}
          </Text>
        ) : null}
      </View>
      {action ? (
        // A lone action in a section is full width (Buttons: where they go); the centered one keeps its size.
        <Button label={action.label} onPress={action.onPress} variant={action.variant ?? 'secondary'} haptic={action.haptic} fullWidth={section} />
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  root: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxxl, paddingHorizontal: space.lg },
  section: { alignItems: 'flex-start', gap: space.md, paddingVertical: space.lg },
  disc: {
    width: size.emptyDisc,
    height: size.emptyDisc,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discError: { backgroundColor: t.colors.dangerSoft },
  text: { gap: space.xs, maxWidth: size.readable },
}));
