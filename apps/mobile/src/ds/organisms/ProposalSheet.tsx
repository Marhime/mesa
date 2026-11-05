import type { Category } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { Checkbox } from '../atoms/Checkbox';
import { Field } from '../molecules/Field';
import { InlineNote } from '../molecules/InlineNote';
import { ListGroup } from '../molecules/ListGroup';
import { LoadingState } from '../molecules/LoadingState';
import { Sheet } from '../molecules/Sheet';
import { FoodRow } from './FoodRow';

export interface ProposalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Lines grouped by what they do; empty while loading. */
  groups: { key: string; label: string; note?: string; lines: { key: string; name: string; category: Category; detail: string }[] }[];
  loading?: boolean;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** A line under the list ("You may have forgotten cilantro: it stays on your list."). */
  footnote?: string;
  onApply: () => void;
  onDismiss: () => void;
  applying?: boolean;
}

/** Review what a scan or a receipt suggests: tick what's right, apply, done. Nothing changes before. */
export function ProposalSheet({
  visible,
  onClose,
  title,
  description,
  groups,
  loading,
  selected,
  onToggle,
  footnote,
  onApply,
  onDismiss,
  applying,
}: ProposalSheetProps) {
  const count = selected.size;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button
            label={count > 0 ? `Apply ${count} ${count === 1 ? 'change' : 'changes'}` : 'Looks right'}
            size="lg"
            fullWidth
            loading={applying}
            onPress={onApply}
          />
          <Button label="Dismiss" variant="ghost" fullWidth onPress={onDismiss} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {groups.map((g) => (
            <Field key={g.key} label={g.label} hint={g.note} aside={`${g.lines.length}`}>
              <ListGroup tone="sunken" inset="none" accessibilityLabel={g.label}>
                {g.lines.map((l) => (
                  <FoodRow
                    key={l.key}
                    tone="sunken"
                    category={l.category}
                    title={l.name}
                    detail={l.detail}
                    trailing={<Checkbox checked={selected.has(l.key)} onToggle={() => onToggle(l.key)} accessibilityLabel={`${l.name}, ${l.detail}`} />}
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
