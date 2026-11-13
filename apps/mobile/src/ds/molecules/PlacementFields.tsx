import type { Zone } from '@mesa/shared';

import { Chip } from '../atoms/Chip';
import { ChipRow } from './ChipRow';
import { Field } from './Field';
import { SegmentedControl } from './SegmentedControl';

export interface PlacementFieldsProps {
  /** Where it goes; leave out to ask only how long it keeps. */
  zone?: Zone;
  onZone?: (zone: Zone) => void;
  /** Days it keeps from today; null = no date. */
  keepsDays: number | null;
  keepsOptions: { days: number | null; label: string }[];
  onKeeps: (days: number | null) => void;
  /** "Until Sun", "No date". */
  keepsHint: string;
}

const ZONES: { value: Zone; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'cupboard', label: 'Cupboard' },
];

/** Where a food goes and how long it keeps (put away, pantry corrections). */
export function PlacementFields({ zone, onZone, keepsDays, keepsOptions, onKeeps, keepsHint }: PlacementFieldsProps) {
  return (
    <>
      {zone && onZone ? (
        <Field label="Where it goes">
          <SegmentedControl options={ZONES} value={zone} onChange={onZone} accessibilityLabel="Where it goes" />
        </Field>
      ) : null}
      <Field label="Keeps for" hint={keepsHint}>
        <ChipRow wrap accessibilityLabel="Keeps for">
          {keepsOptions.map((o) => (
            <Chip key={o.label} label={o.label} selected={o.days === keepsDays} onPress={() => onKeeps(o.days)} />
          ))}
        </ChipRow>
      </Field>
    </>
  );
}
