import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Picto } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { FoodPicto } from '../atoms/FoodPicto';
import { Tag } from '../atoms/Tag';
import { Text } from '../atoms/Text';
import { InlineNote } from '../molecules/InlineNote';
import { ListGroup } from '../molecules/ListGroup';
import { ListRow } from '../molecules/ListRow';
import { PlacementFields } from '../molecules/PlacementFields';
import { Sheet } from '../molecules/Sheet';
import { createStyles } from '../theme';
import { space } from '../tokens';
import { FoodRow } from './FoodRow';

export interface PutAwayItem {
  key: string;
  name: string;
  picto: Picto;
  /** "3", "500 g". */
  quantity: string;
  /** Days it keeps from today; null = no date. */
  keepsDays: number | null;
  /** "Sun", "Nov 25"; null = no date. */
  expiryLabel: string | null;
}

export interface PutAwaySheetProps {
  visible: boolean;
  items: PutAwayItem[];
  /** Items that stay on the list (not in the cart). */
  leftOnList: number;
  /** Choices offered for "Keeps" (days; null = no date). */
  keepsOptions: { days: number | null; label: string }[];
  onChange: (key: string, change: { keepsDays: number | null }) => void;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  /** Use the receipt instead: real quantities and prices, nothing to tap line by line. */
  onScanReceipt?: () => void;
}

const SHOWN = 6;

/**
 * "Done shopping": how long each item keeps; tap a line to change it (a step: its Done goes back to the list,
 * the × closes the sheet as always). Where it goes is the product's usual place.
 */
export function PutAwaySheet({ visible, items, leftOnList, keepsOptions, onChange, onConfirm, onClose, loading, onScanReceipt }: PutAwaySheetProps) {
  const styles = useStyles();
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!visible) {
      setEditing(null);
      setExpanded(false);
    }
  }, [visible]);

  const current = editing ? items.find((i) => i.key === editing) : undefined;
  const count = items.length;
  const title = count > 0 ? `Put away ${count} ${count === 1 ? 'item' : 'items'}` : 'Done shopping?';
  const description = current
    ? undefined
    : count > 0
      ? 'We guessed how long each one keeps. Tap a line to change it.'
      : 'What you bought comes off your list.';
  const confirmLabel = count > 0 ? `Add ${count} ${count === 1 ? 'item' : 'items'} to pantry` : 'Done shopping';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={current ? current.name : title}
      description={description}
      footer={
        current ? (
          <Button label="Done" size="lg" fullWidth accessibilityHint="Back to what you bought" onPress={() => setEditing(null)} />
        ) : (
          <>
            <Button label={confirmLabel} size="lg" fullWidth onPress={onConfirm} loading={loading} />
            {onScanReceipt ? <Button label="Use the receipt instead" variant="ghost" fullWidth onPress={onScanReceipt} /> : null}
          </>
        )
      }
    >
      {current ? (
        <>
          <View style={styles.editHead}>
            <FoodPicto picto={current.picto} size="md" />
            {current.quantity ? (
              <Text variant="body" color="inkMuted">
                {current.quantity}
              </Text>
            ) : null}
          </View>
          <PlacementFields
            keepsDays={current.keepsDays}
            keepsOptions={keepsOptions}
            onKeeps={(keepsDays) => onChange(current.key, { keepsDays })}
            keepsHint={current.expiryLabel ? `Until ${current.expiryLabel}` : 'No date'}
          />
        </>
      ) : (
        <>
          {items.length > 0 ? (
            <ListGroup tone="sunken" inset="picto" accessibilityLabel="Bought">
              {(expanded || items.length <= SHOWN + 1 ? items : items.slice(0, SHOWN)).map((item) => (
                <FoodRow
                  key={item.key}
                  picto={item.picto}
                  title={item.name}
                  detail={item.quantity || undefined}
                  onPress={() => setEditing(item.key)}
                  accessibilityLabel={`${item.name}${item.quantity ? `, ${item.quantity}` : ''}, ${item.expiryLabel ? `keeps until ${item.expiryLabel}` : 'no date'}`}
                  accessibilityHint="Change how long it keeps"
                  trailing={<Tag label={item.expiryLabel ?? 'No date'} icon="calendar" variant="outline" />}
                />
              ))}
              {!expanded && items.length > SHOWN + 1 ? (
                <ListRow key="more" title={`${items.length - SHOWN} more`} chevron onPress={() => setExpanded(true)} />
              ) : null}
            </ListGroup>
          ) : null}
          {leftOnList > 0 ? (
            <InlineNote text={`The ${leftOnList} unchecked ${leftOnList === 1 ? 'item stays' : 'items stay'} on your list for next time.`} />
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const useStyles = createStyles(() => ({
  editHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
}));
