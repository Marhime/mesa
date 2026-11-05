import { View } from 'react-native';

import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { haptics } from '../haptics';
import { createStyles } from '../theme';
import { border, radius, size, space } from '../tokens';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Pill with 2–3 segments; the selected one is lime. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Touchable
            key={o.value}
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
            style={[styles.segment, selected ? styles.selected : null]}
          >
            <Text variant="label" color={selected ? 'onTint' : 'ink'} align="center" numberOfLines={1}>
              {o.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  track: {
    flexDirection: 'row',
    padding: space.xs,
    gap: space.xs,
    borderRadius: radius.full,
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
    backgroundColor: t.colors.surfaceRaised,
  },
  segment: {
    flex: 1,
    minHeight: size.touch - space.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  selected: { backgroundColor: t.colors.select },
}));
