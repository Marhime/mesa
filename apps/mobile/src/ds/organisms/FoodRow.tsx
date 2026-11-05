import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Category } from '@mesa/shared';

import { FoodPicto } from '../atoms/FoodPicto';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { createStyles, useTheme } from '../theme';
import { space } from '../tokens';

export interface FoodRowProps {
  category: Category;
  title: string;
  /** Muted line under the title ("375 g", "Used before it turned · 2 left"). */
  detail?: string;
  /** Icon before the detail (warning for a guessed amount). */
  detailIcon?: IconName;
  /** End of the row: a status ("Have"), a date chip, an amount, or a small button (kept reachable on its own). */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Background the press highlight starts from (rows inside a sunken list). */
  tone?: 'raised' | 'sunken';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** A food in a list: category picto, name, a muted detail, something at the end. */
export function FoodRow({ category, title, detail, detailIcon, trailing, onPress, tone = 'raised', accessibilityLabel, accessibilityHint }: FoodRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const label = accessibilityLabel ?? [title, detail].filter(Boolean).join(', ');
  const body = (
    <>
      <FoodPicto category={category} />
      <View style={styles.text}>
        <Text variant="label" numberOfLines={2}>
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
  const sunken = tone === 'sunken';
  return (
    <View style={styles.row}>
      {onPress ? (
        <Touchable
          onPress={onPress}
          feedback="highlight"
          highlightFrom={sunken ? theme.colors.surfaceSunken : theme.colors.surfaceRaised}
          highlightTo={sunken ? theme.colors.line : theme.colors.surfaceSunken}
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
  text: { flex: 1, minWidth: 0, gap: space.xs / 2 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
}));
