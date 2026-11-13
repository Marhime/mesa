import { useEffect, useState } from 'react';

import { Button } from '../atoms/Button';
import { TextField } from '../atoms/TextField';
import { QuantityField, RECIPE_EDIT_UNITS, useQuantityDraft, type Amount } from '../molecules/QuantityField';
import { Sheet } from '../molecules/Sheet';

export interface IngredientSheetProps {
  /** The ingredient being edited, or a blank one to add; null hides the sheet. */
  item: { key: string; name: string; amount: Amount; isNew: boolean } | null;
  /** "Amounts are for 4 servings." */
  servingsHint: string;
  onSave: (values: { name: string; amount: Amount }) => void;
  onRemove?: () => void;
  onClose: () => void;
  saving?: boolean;
}

/** One ingredient of a recipe: its name and amount (kitchen measures included), or remove it. */
export function IngredientSheet({ item, servingsHint, onSave, onRemove, onClose, saving }: IngredientSheetProps) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (item) setName(item.name);
  }, [item]);
  const amount = useQuantityDraft(item?.amount ?? { quantity: null, unit: null }, item?.key ?? null, undefined, RECIPE_EDIT_UNITS);
  const canSave = name.trim().length > 0 && amount.parsed !== undefined;
  // Changed from the ingredient as it opened (a new one: anything typed).
  const unsaved = item !== null && (name.trim() !== item.name.trim() || amount.dirty);

  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      unsaved={unsaved}
      title={item?.isNew ? 'Add ingredient' : 'Edit ingredient'}
      footer={
        <>
          <Button
            label={item?.isNew ? 'Add' : 'Save'}
            size="lg"
            fullWidth
            disabled={!canSave}
            loading={saving}
            onPress={() => {
              if (canSave && amount.parsed) onSave({ name: name.trim(), amount: amount.parsed });
            }}
          />
          {onRemove && !item?.isNew ? <Button label="Remove from recipe" variant="ghost" tone="danger" fullWidth onPress={onRemove} /> : null}
        </>
      }
    >
      <TextField label="Ingredient" placeholder="Chicken breast" value={name} onChangeText={setName} autoCapitalize="sentences" returnKeyType="done" />
      <QuantityField {...amount.field} label="Amount" placeholder="To taste" hint={servingsHint} />
    </Sheet>
  );
}
