import { View } from 'react-native';

import { Equalizer } from '../atoms/Equalizer';
import { Skeleton } from '../atoms/Skeleton';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, space } from '../tokens';
import { CardGrid } from './CardGrid';
import { EmptyState } from './EmptyState';

/** Centered Equalizer with an optional word. */
export function LoadingState({ label }: { label?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <Equalizer size="lg" accessibilityLabel={label ?? 'Loading'} />
      {label ? (
        <Text variant="caption" color="inkMuted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Placeholder for a list group while it loads. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton shape="line" widthFraction={i % 2 === 0 ? 0.6 : 0.4} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder for the recipe grid. */
export function CardGridSkeleton({ cards = 4 }: { cards?: number }) {
  const styles = useStyles();
  return (
    <CardGrid>
      {Array.from({ length: cards }, (_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton shape="media" />
          <Skeleton shape="line" widthFraction={0.8} />
          <Skeleton shape="line" widthFraction={0.5} />
        </View>
      ))}
    </CardGrid>
  );
}

/** Something failed: say so plainly and offer a way out. */
export function ErrorState({ title = "Couldn't load this", text, onRetry }: { title?: string; text?: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon="offline"
      tone="error"
      title={title}
      text={text ?? 'Check your connection and try again.'}
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

const useStyles = createStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.huge },
  group: { backgroundColor: t.colors.surfaceRaised, borderRadius: radius.lg, paddingVertical: space.sm },
  row: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  card: { gap: space.sm },
}));
