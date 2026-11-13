import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Checkbox } from '../atoms/Checkbox';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { haptics, type HapticKind } from '../haptics';
import { useRowHighlight } from '../molecules/listTone';
import { fade } from '../motion';
import { createStyles, useTheme } from '../theme';
import { size, space, type ColorToken } from '../tokens';
import { useSettle } from '../useSettle';

export interface GroceryRowProps {
  label: string;
  /** Amount to buy, shown on the right ("2", "500 g", "2 + 500 g"); empty for none. */
  quantity?: string;
  /** Recipes this item is for: not shown (they are in the item sheet), read by VoiceOver as a hint. */
  forRecipes?: string[];
  checked: boolean;
  /** Just added: the row flashes selectSoft once. */
  flash?: boolean;
  /**
   * Checking waits `duration.settle` (struck through, in place) before this runs, so a wrong tap
   * can be undone by tapping again; unchecking runs at once.
   */
  onToggle: () => void;
  onEdit?: () => void;
  onHave?: () => void;
  onDelete?: () => void;
}

/**
 * Notes-like grocery line: round checkbox, label, and how much to buy on the right. Tap anywhere on the
 * row to check it; long press (or swipe left) to edit (recipes it is for are there), mark as already at
 * home, or delete.
 */
export function GroceryRow({ label, quantity, forRecipes, checked, flash, onToggle, onEdit, onHave, onDelete }: GroceryRowProps) {
  const styles = useStyles();
  const highlight = useRowHighlight();
  const swipe = useRef<SwipeableMethods>(null);
  const settle = useSettle(onToggle);
  const struck = checked || settle.pending;
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!flash) return;
    glow.set(withSequence(withTiming(1, { duration: 0 }), withTiming(0, fade('flash'))));
  }, [flash, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  const press = () => {
    // The tick as it turns on, like every checkbox; unchecking and taking a tap back are quiet.
    if (!struck) haptics.check();
    if (checked) onToggle();
    else settle.toggle();
  };
  // A long press gives its own `select` tick (Touchable).
  const edit = onEdit && !struck ? onEdit : undefined;

  // VoiceOver reads the row as one checkbox (double tap = check); the other actions are in its actions menu.
  const a11yActions = [
    { name: 'activate' },
    ...(onEdit && !struck ? [{ name: 'edit', label: 'Edit' }] : []),
    ...(onHave && !struck ? [{ name: 'have', label: 'Already have' }] : []),
    ...(onDelete ? [{ name: 'delete', label: 'Delete' }] : []),
  ];
  const a11yLabel = [label, quantity, checked ? 'in the cart' : null].filter(Boolean).join(', ');
  const recipesHint = !checked && forRecipes && forRecipes.length > 0 ? `For ${listText(forRecipes)}.` : undefined;

  const row = (
    <View
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked: struck }}
      accessibilityLabel={a11yLabel}
      accessibilityHint={checked ? 'Puts it back on the list' : recipesHint}
      accessibilityActions={a11yActions}
      onAccessibilityAction={(e) => {
        const action = e.nativeEvent.actionName;
        if (action === 'activate') press();
        if (action === 'edit') onEdit?.();
        if (action === 'have') onHave?.();
        if (action === 'delete') onDelete?.();
      }}
    >
      <Touchable
        onPress={press}
        onLongPress={edit}
        feedback="highlight"
        {...highlight}
        style={styles.row}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.glow, glowStyle]} pointerEvents="none" />
        <Checkbox checked={struck} />
        <View style={styles.body}>
          <View style={styles.name}>
            <Text variant="bodyLg" color={struck ? 'inkMuted' : 'ink'} strike={struck} numberOfLines={2}>
              {label}
            </Text>
            {flash && !checked ? (
              <Text variant="captionStrong" color="inkMuted">
                Just added
              </Text>
            ) : null}
          </View>
          {quantity ? (
            <Text variant="label" color={struck ? 'inkMuted' : 'ink'} strike={struck} tabular numberOfLines={1}>
              {quantity}
            </Text>
          ) : null}
        </View>
      </Touchable>
    </View>
  );

  // Checked rows don't swipe. The wrapper stays mounted either way, so the check fill can animate.
  if (checked || !(onEdit || onHave || onDelete)) return row;
  const act = (fn: () => void) => () => {
    swipe.current?.close();
    fn();
  };
  return (
    <ReanimatedSwipeable
      ref={swipe}
      enabled={!struck}
      friction={2}
      rightThreshold={size.swipeAction / 2}
      overshootRight={false}
      // A light tick when the actions snap open, like Mail.
      onSwipeableWillOpen={() => haptics.check()}
      renderRightActions={() => (
        <View style={styles.actions}>
          {onEdit ? <SwipeAction icon="edit" label="Edit" bg="ink" onPress={act(onEdit)} /> : null}
          {onHave ? <SwipeAction icon="checkCircle" label="Already have" bg="success" haptic="check" onPress={act(onHave)} /> : null}
          {onDelete ? <SwipeAction icon="delete" label="Delete" bg="danger" onPress={act(onDelete)} /> : null}
        </View>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

function SwipeAction({ icon, label, bg, haptic, onPress }: { icon: IconName; label: string; bg: ColorToken; haptic?: HapticKind; onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Touchable onPress={onPress} haptic={haptic} accessibilityLabel={label} style={[styles.action, { backgroundColor: theme.colors[bg] }]}>
      <Icon name={icon} color="onInk" />
      <Text variant="caption" color="onInk" align="center" numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

const useStyles = createStyles((t) => ({
  row: {
    minHeight: size.listRow,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.xs,
    paddingRight: space.lg,
  },
  glow: { backgroundColor: t.colors.selectSoft },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: size.listRow,
    paddingVertical: space.sm,
  },
  name: { flex: 1, gap: space.xxs },
  actions: { flexDirection: 'row' },
  action: {
    width: size.swipeAction,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
}));

/** "Tinga", "Tinga and Pozole", "Tinga, Pozole and Sopa". */
function listText(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
