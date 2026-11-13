import type { Picto } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { Chip } from '../atoms/Chip';
import { ListGroup } from '../molecules/ListGroup';
import { Sheet } from '../molecules/Sheet';
import { FoodRow } from './FoodRow';

export interface StaplesSheetProps {
  visible: boolean;
  onClose: () => void;
  items: { key: string; name: string; picto: Picto; isOut: boolean }[];
  /** Ran out: back on the list until bought (the `add` haptic). */
  onOut: (key: string) => void;
  /** I have it (again): at home (the `check` haptic). */
  onBack: (key: string) => void;
}

/** Salt, oil, spices: never counted, always at home, until one runs out. */
export function StaplesSheet({ visible, onClose, items, onOut, onBack }: StaplesSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Always at home"
      description="These count as at home, so recipes never add them to your list. Mark one when it runs out."
      footer={<Button label="Done" size="lg" fullWidth onPress={onClose} />}
    >
      <ListGroup tone="sunken" inset="picto" accessibilityLabel="Always at home">
        {items.map((s) => (
          <FoodRow
            key={s.key}
            picto={s.picto}
            title={s.name}
            detail={s.isOut ? 'Out · on your list' : undefined}
            trailing={
              s.isOut ? (
                <Chip label="I have it" icon="checkCircle" haptic="check" accessibilityLabel={`I have ${s.name}`} onPress={() => onBack(s.key)} />
              ) : (
                <Chip label="Ran out" haptic="add" accessibilityLabel={`${s.name} ran out`} onPress={() => onOut(s.key)} />
              )
            }
          />
        ))}
      </ListGroup>
    </Sheet>
  );
}
