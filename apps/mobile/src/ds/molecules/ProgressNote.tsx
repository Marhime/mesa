import { View } from 'react-native';

import { Simmer } from '../atoms/Simmer';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { radius, space } from '../tokens';

export interface ProgressNoteProps {
  /** What is happening right now ("Reading the ingredients written on screen…"). */
  text: string;
  /** Work that goes on without the screen (a job): says so under the text. */
  canLeave?: boolean;
}

/** Said under the text of work that carries on when the person leaves. */
const CAN_LEAVE = "You can leave: we'll tell you when it's ready.";

/** Work in progress that needs no waiting: the simmering bubbles and one sentence on a sunken card. */
export function ProgressNote({ text, canLeave }: ProgressNoteProps) {
  const styles = useStyles();
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Simmer size="sm" accessibilityLabel="In progress" />
      <View style={styles.text}>
        <Text variant="body">{text}</Text>
        {canLeave ? (
          <Text variant="caption" color="inkMuted">
            {CAN_LEAVE}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: t.colors.surfaceSunken },
  text: { flex: 1, gap: space.xs },
}));
