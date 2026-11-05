import type { CatalogIndex, Category } from '@mesa/shared';

import type { ResolvedGroceryItem } from '../../lib/groceryInput';
import { Button } from '../atoms/Button';
import { Chip } from '../atoms/Chip';
import { ChipRow } from '../molecules/ChipRow';
import { Field } from '../molecules/Field';
import { FieldButton } from '../molecules/FieldButton';
import { InlineNote } from '../molecules/InlineNote';
import { Sheet } from '../molecules/Sheet';
import { QuickAddField } from './QuickAddField';

export interface AddPantrySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Day one: the staples group is pre-ticked and the copy invites a full check. */
  firstRun: boolean;
  catalog: CatalogIndex | null;
  /** Typed items are added at once (the field clears and stays up). */
  onTyped: (items: ResolvedGroceryItem[]) => void;
  /** Names added by typing while the sheet is open (a toast would hide behind it). */
  justAdded: string[];
  groups: { key: string; label: string; note?: string; items: { key: string; name: string; category: Category }[] }[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Ticked basics to add (staples left ticked don't count: they already are at home). */
  addCount: number;
  onConfirm: () => void;
  loading?: boolean;
  /** Let Mesa look instead of ticking: film a zone ("Film the fridge"), photograph a receipt. */
  scan?: { sweepLabel: string; onSweep: () => void; onReceipt: () => void };
}

/** Add to the pantry: type anything, or tick what is already at home, by where it lives. */
export function AddPantrySheet({
  visible,
  onClose,
  firstRun,
  catalog,
  onTyped,
  justAdded,
  groups,
  selected,
  onToggle,
  addCount,
  onConfirm,
  loading,
  scan,
}: AddPantrySheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={firstRun ? "What's already at home?" : 'Add to pantry'}
      description={
        firstRun
          ? 'Tick what you have, so ideas and your list are right from day one. No dates needed.'
          : 'Type anything, or tick what you have.'
      }
      footer={
        <Button
          label={addCount > 0 ? `Add ${addCount} to pantry` : 'Done'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={addCount > 0 || firstRun ? onConfirm : onClose}
        />
      }
    >
      {scan ? (
        <>
          <FieldButton icon="sparkle" title={scan.sweepLabel} subtitle="Mesa sees what's there and what's gone" onPress={scan.onSweep} />
          <FieldButton icon="file" title="Scan a receipt" subtitle="Or share a screenshot of an order to Mesa" onPress={scan.onReceipt} />
        </>
      ) : null}
      <QuickAddField placeholder="Type anything: arroz, 6 huevos, frijoles…" catalog={catalog} onSubmit={onTyped} />
      {justAdded.length > 0 ? <InlineNote icon="checkCircle" text={`Added: ${justAdded.join(', ')}`} /> : null}
      {groups.map((group) => (
        <Field key={group.key} label={group.label} hint={group.note}>
          <ChipRow wrap accessibilityLabel={group.label}>
            {group.items.map((item) => {
              const on = selected.has(item.key);
              return (
                <Chip
                  key={item.key}
                  label={item.name}
                  icon={on ? 'check' : 'add'}
                  selected={on}
                  accessibilityLabel={item.name}
                  accessibilityHint={on ? 'Ticked' : 'Tick if you have it'}
                  onPress={() => onToggle(item.key)}
                />
              );
            })}
          </ChipRow>
        </Field>
      ))}
    </Sheet>
  );
}
