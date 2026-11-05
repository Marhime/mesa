import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { space } from '../tokens';

export interface LargeTitleProps {
  title: string;
  /** Small muted line above the title (date, who it is shared with, a count). */
  overline?: string;
  /** Element before the overline (household avatars). */
  overlineAccessory?: ReactNode;
  /** One line under the title. */
  subtitle?: string;
  /** Muted figure at the end of the title row ("9 to buy"). */
  aside?: string;
  /** Action at the end of the title row (IconButton). */
  action?: ReactNode;
}

/** Screen header: context line + display title (once per screen) + an aside or an action. */
export function LargeTitle({ title, overline, overlineAccessory, subtitle, aside, action }: LargeTitleProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      {overline || overlineAccessory ? (
        <View style={styles.overlineRow}>
          {overlineAccessory}
          {overline ? (
            <Text variant="caption" color="inkMuted" numberOfLines={1} flex>
              {overline}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color="inkMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {aside ? (
          <Text variant="heading" color="inkMuted" numberOfLines={1}>
            {aside}
          </Text>
        ) : null}
        {action}
      </View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  root: { gap: space.xs },
  overlineRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  titleText: { flex: 1, gap: space.xs },
}));
