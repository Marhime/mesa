import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { haptics } from '../haptics';
import { createStyles } from '../theme';
import { border, radius, size, space } from '../tokens';
import { useSlidingIndicator } from '../useSlidingIndicator';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Pill with 2–4 segments; the ink pill slides to the selected one. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const styles = useStyles();
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const pill = useSlidingIndicator(activeIndex);
  return (
    <View style={styles.track}>
      <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
        <Animated.View style={[styles.pill, pill.indicatorStyle]} pointerEvents="none" />
        {options.map((o, i) => {
          const selected = i === activeIndex;
          return (
            <View key={o.value} style={styles.cell} onLayout={pill.onItemLayout(i)}>
              <Touchable
                onPress={() => {
                  if (!selected) {
                    haptics.select();
                    onChange(o.value);
                  }
                }}
                accessibilityRole="tab"
                accessibilityLabel={o.label}
                accessibilityState={{ selected }}
                // 40 pt segment + the track's padding: the touch target reaches 48 pt.
                hitSlop={{ top: space.xs, bottom: space.xs }}
                style={styles.segment}
              >
                <Text variant="label" color={selected ? 'onSelect' : 'ink'} align="center" numberOfLines={1} chrome>
                  {o.label}
                </Text>
              </Touchable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  track: {
    padding: space.xs,
    borderRadius: radius.full,
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
    backgroundColor: t.colors.surfaceRaised,
  },
  row: { flexDirection: 'row', gap: space.xs },
  pill: { position: 'absolute', top: 0, left: 0, borderRadius: radius.full, backgroundColor: t.colors.select },
  cell: { flex: 1 },
  segment: {
    minHeight: size.touch - space.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
}));
