import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles, useTheme } from '../theme';
import { border, radius, size, space } from '../tokens';

export interface FieldButtonProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Underlined word at the end ("Open"); a chevron when omitted. */
  action?: string;
  onPress: () => void;
  accessibilityHint?: string;
}

/** Looks like a field, acts as a button: a shortcut into another screen ("Add to groceries"). */
export function FieldButton({ icon, title, subtitle, action, onPress, accessibilityHint }: FieldButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      feedback="highlight"
      highlightFrom={theme.colors.surfaceRaised}
      highlightTo={theme.colors.surfaceSunken}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      style={styles.field}
    >
      <Icon name={icon} />
      <View style={styles.text}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="inkMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Text variant="label" underline>
          {action}
        </Text>
      ) : (
        <Icon name="chevron" color="inkMuted" />
      )}
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  field: {
    minHeight: size.fieldButton,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
  },
  text: { flex: 1, minWidth: 0 },
}));
