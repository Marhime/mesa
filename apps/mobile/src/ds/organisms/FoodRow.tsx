import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Picto } from '@mesa/shared';

import { FoodPicto } from '../atoms/FoodPicto';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { useRowHighlight } from '../molecules/listTone';
import { createStyles } from '../theme';
import { size, space } from '../tokens';

export interface FoodRowProps {
  picto: Picto;
  title: string;
  /** An ingredient's amount, in a column before the title ("1½ tbsp"): the names line up and read as a list. */
  amount?: string;
  /** Muted line under the title ("375 g", "Used before it turned · 2 left"). */
  detail?: string;
  /** Icon before the detail (warning for a guessed amount). */
  detailIcon?: IconName;
  /** End of the row: a status ("Have"), a date chip, an amount, or a small button (kept reachable on its own). */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** A food in a list: its picto, name, a muted detail, something at the end. Highlights on the list's tone. */
export function FoodRow({ picto, title, amount, detail, detailIcon, trailing, onPress, accessibilityLabel, accessibilityHint }: FoodRowProps) {
  const styles = useStyles();
  const highlight = useRowHighlight();
  const label = accessibilityLabel ?? [title, detail].filter(Boolean).join(', ');
  const body = (
    <>
      <FoodPicto picto={picto} />
      {amount !== undefined ? (
        <View style={styles.amount}>
          <Text variant="label" tabular numberOfLines={2}>
            {amount}
          </Text>
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant={amount !== undefined ? 'body' : 'label'} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <View style={styles.detail}>
            {detailIcon ? <Icon name={detailIcon} size="sm" color="inkMuted" /> : null}
            <Text variant="caption" color="inkMuted" flex>
              {detail}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Touchable
          onPress={onPress}
          feedback="highlight"
          {...highlight}
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint}
          style={styles.main}
        >
          {body}
        </Touchable>
      ) : (
        <View style={styles.main} accessible accessibilityLabel={label}>
          {body}
        </View>
      )}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.md },
  trailing: { paddingRight: space.lg },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  amount: { width: size.amountColumn },
  detail: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
}));
