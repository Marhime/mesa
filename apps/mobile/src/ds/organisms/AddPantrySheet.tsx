import { useEffect, useState } from 'react';
import type { CatalogIndex, Category } from '@mesa/shared';

import type { ResolvedGroceryItem } from '../../lib/groceryInput';
import { Button } from '../atoms/Button';
import { Chip } from '../atoms/Chip';
import { ChipRow } from '../molecules/ChipRow';
import { Field } from '../molecules/Field';
import { FieldButton } from '../molecules/FieldButton';
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
  /** Names added by typing while the sheet is open: said under the field (a toast would hide behind it). */
  justAdded: string[];
  groups: { key: string; label: string; note?: string; items: { key: string; name: string; category: Category }[] }[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Ticked basics to add (staples left ticked don't count: they already are at home). */
  addCount: number;
  onConfirm: () => void;
  loading?: boolean;
  /** Let Mesa look instead of ticking: film a shelf (one chip per place), photograph a receipt. */
  scan?: { sweeps: { key: string; label: string; onPress: () => void }[]; onReceipt: () => void };
  /** Ticks changed since it opened. With words typed and not added yet, closing asks first. */
  unsaved?: boolean;
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
  unsaved,
}: AddPantrySheetProps) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!visible) setTyping(false);
  }, [visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      unsaved={unsaved || typing}
      title={firstRun ? "What's already at home?" : 'Add to pantry'}
      description={
        firstRun
          ? 'Tick what you have, so ideas and your list are right from day one. No dates needed.'
          : 'Type anything, or tick what you have.'
      }
      footer={
        <Button
          label={addCount > 0 ? `Add ${addCount} to pantry` : firstRun ? 'Save these basics' : 'Done'}
          size="lg"
          fullWidth
          loading={loading}
          onPress={addCount > 0 || firstRun ? onConfirm : onClose}
        />
      }
    >
      {scan ? (
        <>
          <Field label="Let Mesa look" hint="Film a shelf: Mesa sees what's there and what's gone.">
            <ChipRow accessibilityLabel="Film">
              {scan.sweeps.map((s) => (
                <Chip key={s.key} label={s.label} icon="camera" accessibilityLabel={`Film the ${s.label.toLowerCase()}`} onPress={s.onPress} />
              ))}
            </ChipRow>
          </Field>
          <FieldButton icon="receipt" title="Scan a receipt" subtitle="Or share a screenshot of an order to Mesa" onPress={scan.onReceipt} />
        </>
      ) : null}
      <QuickAddField
        placeholder="Type anything: rice, 6 eggs, beans…"
        catalog={catalog}
        onSubmit={onTyped}
        onPending={setTyping}
        confirmation={justAdded.length > 0 ? { text: `Added ${justAdded.join(', ')}` } : null}
      />
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
