import { View } from 'react-native';

import { Chip } from '../atoms/Chip';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface StepRowProps {
  number: number;
  text: string;
  /** Where the step starts in the source video ("2:14"): a small play chip under the text. */
  video?: { label: string; accessibilityLabel: string; onPress: () => void } | null;
}

/** A numbered recipe step, with the moment it starts in the video when known. */
export function StepRow({ number, text, video }: StepRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.number} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="label" tabular>
          {String(number)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="bodyLg" accessibilityLabel={`Step ${number}. ${text}`}>
          {text}
        </Text>
        {video ? <Chip icon="play" label={video.label} accessibilityLabel={video.accessibilityLabel} onPress={video.onPress} /> : null}
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
  body: { flex: 1, gap: space.sm, alignItems: 'flex-start' },
}));
