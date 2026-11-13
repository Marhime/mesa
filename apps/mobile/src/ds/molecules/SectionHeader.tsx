import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles } from '../theme';
import { size, space } from '../tokens';

export interface SectionHeaderProps {
  title: string;
  /** One muted line under the title ("Tap one to see what you can cook with it"). */
  subtitle?: string;
  /** Muted text at the end ("3 planned"). */
  meta?: string;
  /** Link-style action at the end ("See all"). */
  action?: { label: string; onPress: () => void };
  /** Small uppercase label instead of a heading (aisles, "Usual"). */
  overline?: boolean;
  /** Element before the title (CategoryDot). */
  leading?: ReactNode;
}

/** Section title + action link or meta. */
export function SectionHeader({ title, subtitle, meta, action, overline, leading }: SectionHeaderProps) {
  const styles = useStyles();
  return (
    <View style={[styles.row, overline ? styles.overline : null, subtitle ? styles.withSubtitle : null]}>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          {leading}
          <Text variant={overline ? 'overline' : 'heading'} color={overline ? 'inkMuted' : 'ink'} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text variant="body" color="inkMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Touchable onPress={action.onPress} accessibilityLabel={action.label} hitSlop={space.md} style={styles.action}>
          <Text variant="label" underline>
            {action.label}
          </Text>
        </Touchable>
      ) : meta ? (
        <Text variant="caption" color="inkMuted">
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  overline: { paddingHorizontal: space.xs },
  withSubtitle: { alignItems: 'flex-start' },
  titleBlock: { flexShrink: 1, gap: space.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  action: { minHeight: size.touch / 2, justifyContent: 'center' },
}));
