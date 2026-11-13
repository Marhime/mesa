import { View } from 'react-native';

import { Simmer } from '../atoms/Simmer';
import { Skeleton } from '../atoms/Skeleton';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';
import { CardGrid } from './CardGrid';
import { EmptyState } from './EmptyState';
import type { ListTone } from './listTone';
import { Rail } from './Rail';

/** Centered Simmer with an optional word (a whole screen loading). */
export function LoadingState({ label }: { label?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <Simmer size="lg" accessibilityLabel={label ?? 'Loading'} />
      {label ? (
        <Text variant="caption" color="inkMuted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export interface ListSkeletonProps {
  rows?: number;
  /** What the real rows start with, drawn where theirs is (a checkbox: GroceryRow · a food picto: FoodRow), so nothing shifts when they arrive. */
  leading?: 'check' | 'picto';
  /** The ListGroup it stands for: sunken inside a sheet. */
  tone?: ListTone;
}

/** Placeholder for a list group while it loads, row for row like the real one. */
export function ListSkeleton({ rows = 4, leading, tone = 'raised' }: ListSkeletonProps) {
  const styles = useStyles();
  return (
    <View style={[styles.group, tone === 'sunken' ? styles.sunken : null]} accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.row, leading ? styles[leading] : null]}>
          {leading ? <Skeleton shape={leading} /> : null}
          <View style={styles.line}>
            <Skeleton shape="line" widthFraction={i % 2 === 0 ? 0.6 : 0.4} />
          </View>
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

/** Placeholder for a rail of tiles (On the menu): photo, name, status, `itemWidth` wide. */
export function RailSkeleton({ itemWidth, cards = 2 }: { itemWidth: number; cards?: number }) {
  const styles = useStyles();
  return (
    <Rail itemWidth={itemWidth}>
      {Array.from({ length: cards }, (_, i) => (
        <View key={i} style={[styles.tile, { width: itemWidth }]} accessible={i === 0} accessibilityLabel="Loading">
          <Skeleton shape="tile" />
          <View style={styles.tileText}>
            <Skeleton shape="line" widthFraction={0.8} />
            <Skeleton shape="line" widthFraction={0.5} />
          </View>
        </View>
      ))}
    </Rail>
  );
}

export interface ErrorStateProps {
  title?: string;
  text?: string;
  onRetry: () => void;
  /** screen: centered, with its disc (default) · section: a quiet note inside a section, like EmptyState's. */
  size?: 'screen' | 'section';
}

/** Something failed: say so plainly and offer a way out. */
export function ErrorState({ title = "Couldn't load this", text, onRetry, size: kind }: ErrorStateProps) {
  return (
    <EmptyState
      icon="offline"
      tone="error"
      size={kind}
      title={title}
      text={text ?? 'Check your connection and try again.'}
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

// A checkbox sits centered in its 44 pt target, 4 pt from the edge (GroceryRow); a picto 16 pt in, then 12 (FoodRow).
const CHECK_INSET = (size.touch - size.checkbox) / 2;

const useStyles = createStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingVertical: space.huge },
  group: { backgroundColor: t.colors.surfaceRaised, borderRadius: radius.lg, overflow: 'hidden' },
  sunken: { backgroundColor: t.colors.surfaceSunken },
  row: { minHeight: size.listRow, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  check: { paddingLeft: space.xs + CHECK_INSET, gap: CHECK_INSET },
  picto: { gap: space.md },
  line: { flex: 1 },
  card: { gap: space.sm },
  tile: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: t.colors.surfaceRaised },
  tileText: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
}));
