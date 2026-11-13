import { useEffect, useState } from 'react';
import { AISLE_ORDER, CATEGORY_LABEL, type Category, type Unit } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { CategoryDot } from '../atoms/CategoryDot';
import { Chip } from '../atoms/Chip';
import { TextField } from '../atoms/TextField';
import { ChipRow } from '../molecules/ChipRow';
import { Text } from '../atoms/Text';
import { Field } from '../molecules/Field';
import { ListGroup } from '../molecules/ListGroup';
import { ListRow } from '../molecules/ListRow';
import { QuantityField, useQuantityDraft } from '../molecules/QuantityField';
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
  /** It is already at home: off the list, into the pantry (the swipe action, reachable without swiping). */
  onHave?: () => void;
  onDelete?: () => void;
  /** Recipes on the menu that asked for it, with their amount (read-only; "Tinga", "500 g"). */
  recipes?: { title: string; amount: string }[];
}

/** Edit a grocery line: name, quantity, unit and aisle; see which recipes want it; mark it as at home, or delete it. */
export function GroceryEditSheet({ item, onSave, onClose, onHave, onDelete, recipes }: GroceryEditSheetProps) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const amount = useQuantityDraft({ quantity: item?.quantity ?? null, unit: item?.unit ?? null }, item);
  const parsed = amount.parsed;

  useEffect(() => {
    if (!item) return;
    setLabel(item.label);
    setCategory(item.category);
  }, [item]);

  const canSave = label.trim().length > 0 && parsed !== undefined;
  // Changed from the line as it opened: closing by mistake asks before losing it.
  const unsaved = item !== null && (label.trim() !== item.label.trim() || category !== item.category || amount.dirty);

  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      unsaved={unsaved}
      title="Edit item"
      footer={
        <>
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
          {/* The quieter ways out, stacked under Save like every footer's. */}
          {onHave ? <Button label="Already have" variant="ghost" fullWidth haptic="check" onPress={onHave} /> : null}
          {onDelete ? <Button label="Delete" variant="ghost" tone="danger" fullWidth onPress={onDelete} /> : null}
        </>
      }
    >
      <TextField value={label} onChangeText={setLabel} label="Name" autoCapitalize="sentences" returnKeyType="done" />
      <QuantityField {...amount.field} />
      {recipes && recipes.length > 0 ? (
        <Field label="On the menu" hint="Taking a recipe off the menu takes its share off this line.">
          <ListGroup tone="sunken" accessibilityLabel="On the menu">
            {recipes.map((r) => (
              <ListRow
                key={r.title}
                title={r.title}
                trailing={
                  r.amount ? (
                    <Text variant="label" color="inkMuted" tabular>
                      {r.amount}
                    </Text>
                  ) : undefined
                }
              />
            ))}
          </ListGroup>
        </Field>
      ) : null}
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
