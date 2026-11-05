import { View } from 'react-native';

import { IconButton } from '../atoms/IconButton';
import { Text } from '../atoms/Text';
import { haptics } from '../haptics';
import { createStyles } from '../theme';
import { size, space } from '../tokens';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** What is counted, for VoiceOver ("Servings"). */
  label: string;
  /** Value text, e.g. (n) => `${n} servings`. */
  format?: (value: number) => string;
}

/** − value +, adjustable with VoiceOver swipes. */
export function Stepper({ value, onChange, min = 1, max = 20, label, format }: StepperProps) {
  const styles = useStyles();
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, v));
    if (next !== value) {
      haptics.select();
      onChange(next);
    }
  };
  const text = format ? format(value) : String(value);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? value + 1 : value - 1)}
    >
      <IconButton icon="minus" accessibilityLabel={`Fewer ${label.toLowerCase()}`} onPress={() => set(value - 1)} disabled={value <= min} />
      <View style={styles.value}>
        <Text variant="heading" align="center" tabular>
          {text}
        </Text>
      </View>
      <IconButton icon="add" accessibilityLabel={`More ${label.toLowerCase()}`} onPress={() => set(value + 1)} disabled={value >= max} />
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
  value: { minWidth: size.touch, paddingHorizontal: space.xs },
}));
