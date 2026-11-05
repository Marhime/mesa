import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { space } from '../tokens';

export interface InlineNoteProps {
  text: string;
  icon?: IconName;
}

/** A quiet one-line explanation under a control or a list (no box, unlike Banner). */
export function InlineNote({ text, icon = 'info' }: InlineNoteProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Icon name={icon} size="sm" />
      <Text variant="caption" color="inkMuted" flex>
        {text}
      </Text>
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
}));
