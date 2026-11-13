import { useState } from 'react';
import type { Unit } from '@mesa/shared';

import { EDIT_UNITS, EDIT_UNIT_LABEL, fromEditable, sameEditable, toEditable, type EditUnit } from '../../lib/quantityInput';
import { Chip } from '../atoms/Chip';
import { TextField } from '../atoms/TextField';
import { ChipRow } from './ChipRow';
import { Field } from './Field';

export { RECIPE_EDIT_UNITS } from '../../lib/quantityInput';

/** An amount as stored: mass in g, volume in ml; null quantity = no amount. */
export interface Amount {
  quantity: number | null;
  unit: Unit | null;
}

export interface QuantityFieldProps {
  text: string;
  unit: EditUnit;
  onChangeText: (text: string) => void;
  onChangeUnit: (unit: EditUnit) => void;
  error?: string | null;
  label?: string;
  hint?: string;
  placeholder?: string;
  /** Unit chips offered (shopping units by default; RECIPE_EDIT_UNITS adds tbsp, tsp, cup…). */
  units?: readonly EditUnit[];
}

/** A number and its unit ("2" pcs, "1.5" kg). Pair it with useQuantityDraft. */
export function QuantityField({
  text,
  unit,
  onChangeText,
  onChangeUnit,
  error,
  label = 'Quantity',
  hint,
  placeholder = 'Any amount',
  units = EDIT_UNITS,
}: QuantityFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <TextField value={text} onChangeText={onChangeText} label={label} placeholder={placeholder} keyboardType="decimal-pad" error={error} />
      <ChipRow accessibilityLabel="Unit">
        {units.map((u) => (
          <Chip key={u} label={EDIT_UNIT_LABEL[u]} selected={unit === u} onPress={() => onChangeUnit(u)} />
        ))}
      </ChipRow>
    </Field>
  );
}

/**
 * An amount being typed. Starts from `initial`, starts over when `resetKey` changes (another item), and
 * never follows `initial` while the person types. `onValid` hears every readable value as it is typed.
 */
export function useQuantityDraft(
  initial: Amount,
  resetKey: unknown,
  onValid?: (amount: Amount) => void,
  units: readonly EditUnit[] = EDIT_UNITS,
) {
  const start = () => toEditable(initial.quantity, initial.unit, units);
  const [key, setKey] = useState(resetKey);
  // What the fields showed when this draft started: "dirty" compares with it, not with every keystroke.
  const [origin, setOrigin] = useState(start);
  const [text, setText] = useState(origin.text);
  const [unit, setUnit] = useState<EditUnit>(origin.unit);
  if (key !== resetKey) {
    const e = start();
    setKey(resetKey);
    setOrigin(e);
    setText(e.text);
    setUnit(e.unit);
  }

  const update = (t: string, u: EditUnit) => {
    setText(t);
    setUnit(u);
    const amount = fromEditable(t, u);
    if (amount && onValid) onValid(amount);
  };
  const parsed = fromEditable(text, unit);
  const dirty = !sameEditable({ text, unit }, origin);

  return {
    /** Spread into <QuantityField />. */
    field: {
      units,
      text,
      unit,
      onChangeText: (t: string) => update(t, unit),
      onChangeUnit: (u: EditUnit) => update(text, u),
      error: parsed === undefined ? 'Use a number, like 2 or 1.5' : null,
    },
    /** The amount as stored; undefined while the number is unreadable. */
    parsed,
    /** Differs from what it started with, readable or not: closing would lose it (a sheet's `unsaved`). */
    dirty,
    /** Differs from what it started with and is readable. */
    changed: parsed !== undefined && dirty,
  };
}
