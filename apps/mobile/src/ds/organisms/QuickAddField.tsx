import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { CatalogIndex } from '@mesa/shared';

import { previewLabel, resolveGroceryInput, type ResolvedGroceryItem } from '../../lib/groceryInput';
import { CategoryDot } from '../atoms/CategoryDot';
import { Chip } from '../atoms/Chip';
import { TextField } from '../atoms/TextField';
import { haptics } from '../haptics';
import { ChipRow } from '../molecules/ChipRow';
import { createStyles } from '../theme';
import { space } from '../tokens';

export interface QuickAddFieldProps {
  /** "Add to groceries…" */
  placeholder: string;
  catalog: CatalogIndex | null;
  /** Called with every item understood; the field clears and keeps the keyboard up. */
  onSubmit: (items: ResolvedGroceryItem[]) => void;
  autoFocus?: boolean;
}

/**
 * The fastest way in: type or paste anything ("2 aguacates, leche"), press Return.
 * While typing it shows what it understood as small chips.
 */
export function QuickAddField({ placeholder, catalog, onSubmit, autoFocus }: QuickAddFieldProps) {
  const styles = useStyles();
  const [text, setText] = useState('');
  const items = useMemo(() => resolveGroceryInput(text, catalog), [text, catalog]);

  const submit = () => {
    if (items.length === 0) return;
    haptics.add();
    onSubmit(items);
    setText('');
  };

  return (
    <View style={styles.root}>
      <TextField
        value={text}
        onChangeText={setText}
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
        hint={items.length > 1 ? `Return adds ${items.length} items` : undefined}
      />
      {items.length > 0 ? (
        <ChipRow wrap accessibilityLabel="Understood">
          {items.map((item, i) => (
            <Chip
              key={`${item.raw}-${i}`}
              passive
              label={previewLabel(item)}
              leading={<CategoryDot category={item.category} />}
            />
          ))}
        </ChipRow>
      ) : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  root: { gap: space.sm },
}));
