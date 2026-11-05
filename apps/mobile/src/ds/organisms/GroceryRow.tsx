import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Checkbox } from '../atoms/Checkbox';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Tag } from '../atoms/Tag';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { easeOut } from '../motion';
import { createStyles, useTheme } from '../theme';
import { duration, size, space, type ColorToken } from '../tokens';

export interface GroceryRowProps {
  label: string;
  /** Formatted quantity ("2", "500 g"); empty for none. */
  quantity?: string;
  /** Recipes this item is for. */
  tags?: string[];
  checked: boolean;
  /** Just added: the row flashes selectSoft once. */
  flash?: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onHave?: () => void;
  onDelete?: () => void;
}

/** Notes-like grocery line: round checkbox, label, muted quantity, recipe tags; swipe left for actions. */
export function GroceryRow({ label, quantity, tags, checked, flash, onToggle, onEdit, onHave, onDelete }: GroceryRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!flash) return;
    glow.set(withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: duration.flash, easing: easeOut })));
  }, [flash, glow]);

  const raised = theme.colors.surfaceRaised;
  const soft = theme.colors.selectSoft;
  const bg = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(glow.get(), [0, 1], [raised, soft]) }));

  const canSwipe = !checked && (onHave || onDelete);
  // VoiceOver reads the row as one checkbox (double tap = check); the swipe actions are in its actions menu.
  const a11yActions = [
    { name: 'activate' },
    ...(onEdit && !checked ? [{ name: 'edit', label: 'Edit' }] : []),
    ...(onHave && !checked ? [{ name: 'have', label: 'Already have' }] : []),
    ...(onDelete ? [{ name: 'delete', label: 'Delete' }] : []),
  ];
  const a11yLabel = [label, quantity, checked ? 'in the cart' : null, ...(checked ? [] : (tags ?? []).map((t) => `for ${t}`))]
    .filter(Boolean)
    .join(', ');

  const row = (
    <Animated.View
      style={[styles.row, bg]}
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={a11yLabel}
      accessibilityActions={a11yActions}
      onAccessibilityAction={(e) => {
        const action = e.nativeEvent.actionName;
        if (action === 'activate') onToggle();
        if (action === 'edit') onEdit?.();
        if (action === 'have') onHave?.();
        if (action === 'delete') onDelete?.();
      }}
    >
      <Checkbox checked={checked} onToggle={onToggle} accessibilityLabel={quantity ? `${label}, ${quantity}` : label} />
      <Touchable
        onPress={checked ? onToggle : onEdit}
        accessibilityLabel={checked ? `${label}, in the cart` : `Edit ${label}`}
        accessibilityHint={checked ? 'Puts it back on the list' : undefined}
        style={styles.body}
      >
        <Text variant="bodyLg" color={checked ? 'inkMuted' : 'ink'} strike={checked} numberOfLines={2} flex>
          {label}
          {quantity ? (
            <Text variant="bodyLg" color="inkMuted" strike={checked}>
              {` · ${quantity}`}
            </Text>
          ) : null}
        </Text>
        {flash && !checked ? (
          <Text variant="captionStrong" color="inkMuted">
            Just added
          </Text>
        ) : tags && tags.length > 0 && !checked ? (
          <View style={styles.tags}>
            {tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </View>
        ) : null}
      </Touchable>
    </Animated.View>
  );

  if (!canSwipe) return row;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={2}
      rightThreshold={size.swipeAction / 2}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.actions}>
          {onHave ? (
            <SwipeAction
              icon="have"
              label="Already have"
              bg="success"
              onPress={() => {
                swipe.current?.close();
                onHave();
              }}
            />
          ) : null}
          {onDelete ? (
            <SwipeAction
              icon="delete"
              label="Delete"
              bg="danger"
              onPress={() => {
                swipe.current?.close();
                onDelete();
              }}
            />
          ) : null}
        </View>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

function SwipeAction({ icon, label, bg, onPress }: { icon: IconName; label: string; bg: ColorToken; onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Touchable onPress={onPress} accessibilityLabel={label} style={[styles.action, { backgroundColor: theme.colors[bg] }]}>
      <Icon name={icon} color="onInk" />
      <Text variant="caption" color="onInk" align="center" numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

const useStyles = createStyles(() => ({
  row: {
    minHeight: size.listRow,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.xs,
    paddingRight: space.lg,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.listRow,
    paddingVertical: space.sm,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.xs, maxWidth: '45%' },
  actions: { flexDirection: 'row' },
  action: {
    width: size.swipeAction,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
}));
