import { View } from 'react-native';
import type { Picto } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { Checkbox } from '../atoms/Checkbox';
import { confirmDiscard } from '../confirmDiscard';
import { Field } from '../molecules/Field';
import { InlineNote } from '../molecules/InlineNote';
import { ListGroup } from '../molecules/ListGroup';
import { ListSkeleton } from '../molecules/LoadingState';
import { QuantityField, useQuantityDraft, type Amount } from '../molecules/QuantityField';
import { Sheet } from '../molecules/Sheet';
import { createStyles } from '../theme';
import { space } from '../tokens';
import { FoodRow } from './FoodRow';

export interface ProposalLine {
  key: string;
  name: string;
  picto: Picto;
  detail: string;
  /** Present when the amount can be fixed (not for "Not seen"). */
  amount?: Amount;
}

export interface ProposalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Lines grouped by what they do; empty while loading. */
  groups: { key: string; label: string; note?: string; lines: ProposalLine[] }[];
  loading?: boolean;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** The line whose amount is open for fixing (one at a time). */
  editingKey: string | null;
  onEdit: (key: string | null) => void;
  /** Every readable amount as it is typed. */
  onAmount: (key: string, amount: Amount) => void;
  /** A line under the list ("You may have forgotten cilantro: it stays on your list."). */
  footnote?: string;
  onApply: () => void;
  /** Throws the scan away ("Discard"): asks first when `unsaved`, like closing. */
  onDismiss: () => void;
  applying?: boolean;
  /** Ticks or amounts changed from what Mesa proposed: closing or discarding asks before losing them. */
  unsaved?: boolean;
}

/** Review what a scan or a receipt suggests: tick what's right, fix an amount, apply. Nothing changes before. */
export function ProposalSheet({
  visible,
  onClose,
  title,
  description,
  groups,
  loading,
  selected,
  onToggle,
  editingKey,
  onEdit,
  onAmount,
  footnote,
  onApply,
  onDismiss,
  applying,
  unsaved,
}: ProposalSheetProps) {
  const count = selected.size;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      unsaved={unsaved}
      title={title}
      description={description}
      footer={
        <>
          <Button
            label={count > 0 ? `Update pantry (${count})` : 'Looks right'}
            size="lg"
            fullWidth
            loading={applying}
            onPress={onApply}
          />
          <Button label="Discard" variant="ghost" fullWidth onPress={() => (unsaved ? confirmDiscard(onDismiss) : onDismiss())} />
        </>
      }
    >
      {loading ? (
        <ListSkeleton rows={4} leading="picto" tone="sunken" />
      ) : (
        <>
          {groups.map((g) => (
            <Field key={g.key} label={g.label} hint={g.note} aside={`${g.lines.length}`}>
              <ListGroup tone="sunken" inset="picto" accessibilityLabel={g.label}>
                {g.lines.map((l) => (
                  <ProposalLineRow
                    key={l.key}
                    line={l}
                    checked={selected.has(l.key)}
                    onToggle={() => onToggle(l.key)}
                    editing={editingKey === l.key}
                    onEdit={l.amount ? () => onEdit(editingKey === l.key ? null : l.key) : undefined}
                    onAmount={(a) => onAmount(l.key, a)}
                  />
                ))}
              </ListGroup>
            </Field>
          ))}
          {footnote ? <InlineNote text={footnote} /> : null}
        </>
      )}
    </Sheet>
  );
}

function ProposalLineRow({
  line,
  checked,
  onToggle,
  editing,
  onEdit,
  onAmount,
}: {
  line: ProposalLine;
  checked: boolean;
  onToggle: () => void;
  editing: boolean;
  onEdit?: () => void;
  onAmount: (amount: Amount) => void;
}) {
  return (
    <View>
      <FoodRow
        picto={line.picto}
        title={line.name}
        detail={line.detail}
        onPress={onEdit}
        accessibilityHint={onEdit ? (editing ? 'Closes the amount' : 'Fixes the amount') : undefined}
        trailing={<Checkbox checked={checked} onToggle={onToggle} accessibilityLabel={`${line.name}, ${line.detail}`} />}
      />
      {editing && line.amount ? <LineAmountEditor lineKey={line.key} initial={line.amount} onAmount={onAmount} /> : null}
    </View>
  );
}

/** Opens under its line; each readable value is kept at once (no Save step). */
function LineAmountEditor({ lineKey, initial, onAmount }: { lineKey: string; initial: Amount; onAmount: (amount: Amount) => void }) {
  const styles = useStyles();
  const draft = useQuantityDraft(initial, lineKey, onAmount);
  return (
    <View style={styles.editor}>
      <QuantityField {...draft.field} label="Amount" placeholder="Not counted" hint="0 if there is none." />
    </View>
  );
}

const useStyles = createStyles(() => ({
  editor: { paddingHorizontal: space.lg, paddingBottom: space.lg },
}));
