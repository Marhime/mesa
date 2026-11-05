import { View } from 'react-native';

import { Equalizer } from '../atoms/Equalizer';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, space } from '../tokens';

export interface ProgressNoteProps {
  /** What is happening right now ("Reading the ingredients written on screen…"). */
  text: string;
}

/** Work in progress that needs no waiting: the equalizer and one sentence on a sunken card. */
export function ProgressNote({ text }: ProgressNoteProps) {
  const styles = useStyles();
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Equalizer size="sm" accessibilityLabel="In progress" />
      <Text variant="body" flex>
        {text}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: t.colors.surfaceSunken },
}));
