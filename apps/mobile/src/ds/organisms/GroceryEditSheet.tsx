import { useEffect, useState } from 'react';
import { AISLE_ORDER, CATEGORY_LABEL, type Category, type Unit } from '@mesa/shared';

import { EDIT_UNITS, EDIT_UNIT_LABEL, fromEditable, toEditable, type EditUnit } from '../../lib/quantityInput';
import { Button } from '../atoms/Button';
import { CategoryDot } from '../atoms/CategoryDot';
import { Chip } from '../atoms/Chip';
import { TextField } from '../atoms/TextField';
import { ChipRow } from '../molecules/ChipRow';
import { Field } from '../molecules/Field';
import { Sheet } from '../molecules/Sheet';

export interface GroceryEditValues {
  label: string;
  quantity: number | null;
  unit: Unit | null;
  category: Category;
}

export interface GroceryEditSheetProps {
  /** The item being edited; null hides the sheet. */
  item: GroceryEditValues | null;
  onSave: (values: GroceryEditValues) => void;
  onClose: () => void;
}

/** Edit a grocery line: name, quantity, unit and aisle. */
export function GroceryEditSheet({ item, onSave, onClose }: GroceryEditSheetProps) {
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<EditUnit>('none');
  const [category, setCategory] = useState<Category>('other');

  useEffect(() => {
    if (!item) return;
    const editable = toEditable(item.quantity, item.unit);
    setLabel(item.label);
    setQty(editable.text);
    setUnit(editable.unit);
    setCategory(item.category);
  }, [item]);

  const parsed = fromEditable(qty, unit);
  const canSave = label.trim().length > 0 && parsed !== undefined;

  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      title="Edit item"
      footer={
        <Button
          label="Save"
          size="lg"
          fullWidth
          disabled={!canSave}
          onPress={() => {
            if (!parsed || !canSave) return;
            onSave({ label: label.trim(), quantity: parsed.quantity, unit: parsed.unit, category });
          }}
        />
      }
    >
      <TextField value={label} onChangeText={setLabel} label="Name" autoCapitalize="sentences" returnKeyType="done" />
      <Field label="Quantity">
        <TextField
          value={qty}
          onChangeText={setQty}
          label="Quantity"
          placeholder="Any amount"
          keyboardType="decimal-pad"
          error={parsed === undefined ? 'Use a number, like 2 or 1.5' : null}
        />
        <ChipRow accessibilityLabel="Unit">
          {EDIT_UNITS.map((u) => (
            <Chip key={u} label={EDIT_UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
          ))}
        </ChipRow>
      </Field>
      <Field label="Aisle">
        <ChipRow wrap accessibilityLabel="Aisle">
          {AISLE_ORDER.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_LABEL[c]}
              selected={category === c}
              leading={<CategoryDot category={c} />}
              onPress={() => setCategory(c)}
            />
          ))}
        </ChipRow>
      </Field>
    </Sheet>
  );
}
