import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles, useTheme } from '../theme';
import { size, space, type ColorToken } from '../tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  titleColor?: ColorToken;
  /** The list's background, for the press highlight (sunken lists inside sheets). */
  tone?: 'raised' | 'sunken';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** Row inside a ListGroup: leading, title, subtitle, trailing, chevron. Min 56 high. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron,
  onPress,
  titleColor = 'ink',
  tone = 'raised',
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text variant="label" color={titleColor} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="inkMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <Icon name="chevron" size="sm" color="inkMuted" /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Touchable
      onPress={onPress}
      feedback="highlight"
      highlightFrom={tone === 'sunken' ? theme.colors.surfaceSunken : theme.colors.surfaceRaised}
      highlightTo={tone === 'sunken' ? theme.colors.line : theme.colors.surfaceSunken}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      style={styles.row}
    >
      {body}
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  row: {
    minHeight: size.listRow,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  leading: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  trailing: { alignItems: 'flex-end', justifyContent: 'center' },
}));
