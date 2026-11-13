import type { PantryLevel, Picto } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { FoodPicto } from '../atoms/FoodPicto';
import { Field } from '../molecules/Field';
import { PlacementFields } from '../molecules/PlacementFields';
import { QuantityField, useQuantityDraft, type Amount } from '../molecules/QuantityField';
import { SegmentedControl } from '../molecules/SegmentedControl';
import { Sheet } from '../molecules/Sheet';

export interface PantryItemSheetProps {
  visible: boolean;
  onClose: () => void;
  item: {
    /** The pantry row (the same food can be in two places). */
    id: string;
    name: string;
    picto: Picto;
    /** "500 g · Keeps until Nov 12". */
    description: string;
    /** Past its date: ask "Still there?" first. */
    stale: boolean;
    /** The exact amount, when known ("2 pcs", "500 g"). */
    amount: Amount;
    level: PantryLevel;
    keepsDays: number | null;
    keepsHint: string;
  } | null;
  /** "Or roughly" (Plenty / Half / Low): how much is left while it is still here. */
  levels: { value: PantryLevel; label: string }[];
  keepsOptions: { days: number | null; label: string }[];
  /** A corrected amount, sent when the sheet closes. */
  onAmount: (amount: Amount) => void;
  onLevel: (level: PantryLevel) => void;
  onKeeps: (days: number | null) => void;
  /** Past its date but fine: a few more days. */
  onStillGood: () => void;
  /** Past its date and gone. */
  onGone: () => void;
  /** None left ("Ran out"): out of the pantry and back on the grocery list. */
  onRanOut: () => void;
}

/**
 * One thing in the pantry: how much is left (an exact amount, or roughly) and how long it keeps;
 * "Still there?" when past its date. A typed amount is saved when the sheet closes; one that can't be read
 * would be lost, so closing asks first and Done waits for a number. What takes it out of the pantry is a
 * footer action ("Ran out", "It's gone"), never a tap among the settings.
 */
export function PantryItemSheet({
  visible,
  onClose,
  item,
  levels,
  keepsOptions,
  onAmount,
  onLevel,
  onKeeps,
  onStillGood,
  onGone,
  onRanOut,
}: PantryItemSheetProps) {
  const initial = item?.amount ?? { quantity: null, unit: null };
  // Starts over for another row, or when the amount changes elsewhere (Half / Low clear it, the other phone).
  const amount = useQuantityDraft(initial, `${visible}:${item?.id}:${initial.quantity}:${initial.unit}`);
  const close = () => {
    if (amount.changed && amount.parsed) onAmount(amount.parsed);
    onClose();
  };
  const unreadable = amount.dirty && amount.parsed === undefined;
  return (
    <Sheet
      visible={visible && item !== null}
      onClose={close}
      unsaved={unreadable}
      title={item?.name}
      description={item?.description}
      footer={
        item?.stale ? (
          <>
            <Button label="Still good" size="lg" fullWidth onPress={onStillGood} />
            <Button label="It's gone" variant="ghost" fullWidth onPress={onGone} />
          </>
        ) : (
          <>
            <Button label="Done" size="lg" fullWidth disabled={unreadable} onPress={close} />
            <Button label="Ran out" variant="ghost" fullWidth haptic="add" accessibilityHint="Takes it out of the pantry and puts it on your list" onPress={onRanOut} />
          </>
        )
      }
    >
      {item ? (
        <>
          <FoodPicto picto={item.picto} size="md" />
          <QuantityField {...amount.field} label="Amount" placeholder="Not counted" hint="Cooking takes from it." />
          <Field label="Or roughly">
            <SegmentedControl options={levels} value={item.level} onChange={onLevel} accessibilityLabel="How much is left, roughly" />
          </Field>
          <PlacementFields
            keepsDays={item.keepsDays}
            keepsOptions={keepsOptions}
            onKeeps={onKeeps}
            keepsHint={item.keepsHint}
          />
        </>
      ) : null}
    </Sheet>
  );
}
