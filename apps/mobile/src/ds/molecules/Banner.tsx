import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface BannerProps {
  text: string;
  title?: string;
  /** warning: neutral note · danger: something failed. */
  tone?: 'warning' | 'danger';
  action?: { label: string; onPress: () => void };
}

/** Inline note for warnings and errors. */
export function Banner({ text, title, tone = 'warning', action }: BannerProps) {
  const styles = useStyles();
  return (
    <View style={[styles.root, tone === 'danger' ? styles.danger : styles.warning]} accessibilityRole="alert">
      <Icon name={tone === 'danger' ? 'warning' : 'info'} color={tone === 'danger' ? 'danger' : 'inkMuted'} />
      <View style={styles.body}>
        {title ? <Text variant="label">{title}</Text> : null}
        <Text variant="body">{text}</Text>
        {action ? (
          <Touchable onPress={action.onPress} accessibilityLabel={action.label} style={styles.action}>
            <Text variant="label" underline>
              {action.label}
            </Text>
          </Touchable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  root: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.md, alignItems: 'flex-start' },
  warning: { backgroundColor: t.colors.surfaceSunken },
  danger: { backgroundColor: t.colors.dangerSoft },
  body: { flex: 1, gap: space.xs },
  action: { alignSelf: 'flex-start', minHeight: size.touch, justifyContent: 'center' },
}));
