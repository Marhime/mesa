import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, radius, size, space } from '../tokens';

export interface SegmentBarProps {
  /** Number of segments. */
  total: number;
  /** Segments filled with ink, from the left. */
  filled: number;
  /** lg: 10 high, empty segments outlined (ingredients at home) · sm: 6 high, empty ones sunken (pantry level). */
  size?: 'sm' | 'lg';
  accessibilityLabel?: string;
}

/** A count shown as pill segments. */
export function SegmentBar({ total, filled, size: sizeName = 'sm', accessibilityLabel }: SegmentBarProps) {
  const styles = useStyles();
  const lg = sizeName === 'lg';
  return (
    <View
      style={styles.row}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityLabel ? { min: 0, max: total, now: filled } : undefined}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.segment, lg ? styles.lg : styles.sm, i < filled ? styles.full : lg ? styles.outline : styles.sunken]}
        />
      ))}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  row: { flexDirection: 'row', gap: space.xs },
  segment: { flex: 1, borderRadius: radius.full },
  sm: { height: size.segment },
  lg: { height: size.segmentLg },
  full: { backgroundColor: t.colors.ink },
  outline: { borderWidth: border.control, borderColor: t.colors.lineStrong },
  sunken: { backgroundColor: t.colors.surfaceSunken },
}));
