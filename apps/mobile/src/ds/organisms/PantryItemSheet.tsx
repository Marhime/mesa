import type { Category, PantryLevel, Zone } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { FoodPicto } from '../atoms/FoodPicto';
import { Field } from '../molecules/Field';
import { PlacementFields } from '../molecules/PlacementFields';
import { SegmentedControl } from '../molecules/SegmentedControl';
import { Sheet } from '../molecules/Sheet';

export interface PantryItemSheetProps {
  visible: boolean;
  onClose: () => void;
  item: {
    name: string;
    category: Category;
    /** "500 g · Keeps until Nov 12". */
    description: string;
    /** Past its date: ask "Still there?" first. */
    stale: boolean;
    level: PantryLevel;
    zone: Zone;
    keepsDays: number | null;
    keepsHint: string;
  } | null;
  levels: { value: PantryLevel; label: string }[];
  keepsOptions: { days: number | null; label: string }[];
  onLevel: (level: PantryLevel) => void;
  onZone: (zone: Zone) => void;
  onKeeps: (days: number | null) => void;
  /** Past its date but fine: a few more days. */
  onStillGood: () => void;
  /** Past its date and gone. */
  onGone: () => void;
  onAddToList: () => void;
}

/** One thing in the pantry: how much is left, where it is, how long it keeps; "Still there?" when past its date. */
export function PantryItemSheet({
  visible,
  onClose,
  item,
  levels,
  keepsOptions,
  onLevel,
  onZone,
  onKeeps,
  onStillGood,
  onGone,
  onAddToList,
}: PantryItemSheetProps) {
  return (
    <Sheet
      visible={visible && item !== null}
      onClose={onClose}
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
            <Button label="Done" size="lg" fullWidth onPress={onClose} />
            <Button label="Add to groceries" variant="ghost" fullWidth onPress={onAddToList} />
          </>
        )
      }
    >
      {item ? (
        <>
          <FoodPicto category={item.category} size="md" />
          <Field label="How much is left" hint="Out puts it back on your list.">
            <SegmentedControl options={levels} value={item.level} onChange={onLevel} accessibilityLabel="How much is left" />
          </Field>
          <PlacementFields
            zone={item.zone}
            onZone={onZone}
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
