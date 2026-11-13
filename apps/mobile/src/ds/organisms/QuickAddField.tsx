import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import type { CatalogIndex } from '@mesa/shared';

import { previewLabel, resolveGroceryInput, type ResolvedGroceryItem } from '../../lib/groceryInput';
import { CategoryDot } from '../atoms/CategoryDot';
import { Chip } from '../atoms/Chip';
import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { TextField } from '../atoms/TextField';
import { Touchable } from '../atoms/Touchable';
import { haptics } from '../haptics';
import { ChipRow } from '../molecules/ChipRow';
import { swapIn, swapOut } from '../motion';
import { createStyles } from '../theme';
import { size, space } from '../tokens';

export interface QuickAddFieldProps {
  /** "Add to groceries…" */
  placeholder: string;
  catalog: CatalogIndex | null;
  /** Called with every item understood; the field clears and keeps the keyboard up. */
  onSubmit: (items: ResolvedGroceryItem[]) => void;
  autoFocus?: boolean;
  /** What the last Return did, right under the field where the eyes are ("Added leche to Dairy · Undo"). */
  confirmation?: { text: string; onUndo?: () => void } | null;
  /** The line under the field while nothing is typed or confirmed (the "Usual" picks); a hint by default. */
  idle?: ReactNode;
  /** Hears whether something is typed and not added yet (a sheet asks before closing on it). */
  onPending?: (pending: boolean) => void;
}

/**
 * The fastest way in: type or paste anything ("2 aguacates, leche"), press Return. One line under the field,
 * always there so nothing below it moves, shows what it understood as chips while typing, then what was added
 * (with Undo), else `idle`; each swaps in place.
 */
export function QuickAddField({ placeholder, catalog, onSubmit, autoFocus, confirmation, idle, onPending }: QuickAddFieldProps) {
  const styles = useStyles();
  const [text, setText] = useState('');
  const items = useMemo(() => resolveGroceryInput(text, catalog), [text, catalog]);
  const change = (t: string) => {
    setText(t);
    onPending?.(t.trim().length > 0);
  };

  const submit = () => {
    if (items.length === 0) return;
    haptics.add();
    onSubmit(items);
    change('');
  };

  const mode = items.length > 0 ? 'understood' : confirmation ? 'added' : 'idle';
  const line =
    mode === 'understood' ? (
      <ChipRow accessibilityLabel={items.length > 1 ? `Return adds ${items.length} items` : 'Understood'}>
        {items.map((item, i) => (
          <Chip key={`${item.raw}-${i}`} passive label={previewLabel(item)} leading={<CategoryDot category={item.category} />} />
        ))}
      </ChipRow>
    ) : mode === 'added' && confirmation ? (
      <View style={styles.confirm} accessibilityLiveRegion="polite">
        <Icon name="check" size="sm" color="success" />
        <Text variant="caption" color="inkMuted" numberOfLines={2} flex>
          {confirmation.text}
        </Text>
        {confirmation.onUndo ? (
          <Touchable onPress={confirmation.onUndo} accessibilityLabel={`Undo: ${confirmation.text}`} style={styles.undo}>
            <Text variant="label" underline>
              Undo
            </Text>
          </Touchable>
        ) : null}
      </View>
    ) : (
      (idle ?? (
        <Text variant="caption" color="inkMuted">
          Commas add several at once.
        </Text>
      ))
    );

  return (
    <View style={styles.root}>
      <TextField
        value={text}
        onChangeText={change}
        label={placeholder.replace(/…$/, '')}
        placeholder={placeholder}
        icon="add"
        clearable
        grow
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="sentences"
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={submit}
      />
      <View style={styles.line}>
        <LayoutAnimationConfig skipEntering>
          <Animated.View key={mode} entering={swapIn()} exiting={swapOut()}>
            {line}
          </Animated.View>
        </LayoutAnimationConfig>
      </View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  root: { gap: space.xs },
  line: { minHeight: size.touch, justifyContent: 'center' },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  undo: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: space.sm },
}));
