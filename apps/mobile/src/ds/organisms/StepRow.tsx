import { View } from 'react-native';

import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface StepRowProps {
  number: number;
  text: string;
}

/** A numbered recipe step. */
export function StepRow({ number, text }: StepRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`Step ${number}. ${text}`}>
      <View style={styles.number}>
        <Text variant="label" tabular>
          {String(number)}
        </Text>
      </View>
      <View style={styles.text}>
        <Text variant="bodyLg">{text}</Text>
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  number: {
    width: size.stepNumber,
    height: size.stepNumber,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
}));
