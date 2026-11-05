import { View } from 'react-native';

import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { space, type ColorToken } from '../tokens';

export interface MetaProps {
  icon: IconName;
  text: string;
  /** muted: metadata · success: "All at home", "Have" · ink: on lime and pastel cards · danger: "Almost out". */
  tone?: 'muted' | 'success' | 'ink' | 'danger';
  /** Semibold, for a status ("Have"). */
  strong?: boolean;
}

const COLOR: Record<NonNullable<MetaProps['tone']>, ColorToken> = {
  muted: 'inkMuted',
  success: 'success',
  ink: 'onTint',
  danger: 'danger',
};

/** Icon + caption ("25 min", "All at home"). */
export function Meta({ icon, text, tone = 'muted', strong }: MetaProps) {
  const styles = useStyles();
  const color = COLOR[tone];
  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      <Icon name={icon} size="sm" color={color} />
      <Text variant={strong ? 'captionStrong' : 'caption'} color={color} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
}));
