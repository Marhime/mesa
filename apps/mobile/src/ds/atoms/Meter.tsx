import { View } from 'react-native';

import { createStyles } from '../theme';
import { art, radius, size } from '../tokens';

export interface MeterProps {
  /** 0–1. */
  value: number;
  accessibilityLabel?: string;
}

/** Thin bar on a pastel card: ink fill on a white track (how long food keeps). */
export function Meter({ value, accessibilityLabel }: MeterProps) {
  const styles = useStyles();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      style={styles.track}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityLabel ? { min: 0, max: 100, now: pct } : undefined}
    >
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const useStyles = createStyles(() => ({
  track: { height: size.meter, borderRadius: radius.full, backgroundColor: art.paper, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: art.ink },
}));
