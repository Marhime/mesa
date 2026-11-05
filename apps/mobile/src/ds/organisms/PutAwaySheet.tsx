import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Category, Zone } from '@mesa/shared';

import { Button } from '../atoms/Button';
import { FoodPicto } from '../atoms/FoodPicto';
import { Tag } from '../atoms/Tag';
import { Text } from '../atoms/Text';
import { Field } from '../molecules/Field';
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
  category: Category;
  /** "3", "500 g". */
  quantity: string;
  zone: Zone;
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
  onChange: (key: string, change: { zone?: Zone; keepsDays?: number | null }) => void;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  /** Use the receipt instead: real quantities and prices, nothing to tap line by line. */
  onScanReceipt?: () => void;
}

const ZONES: { value: Zone; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'cupboard', label: 'Cupboard' },
];
const SHOWN = 3;

/** "Done shopping": where each item goes and how long it keeps, grouped by zone; tap a line to change it. */
export function PutAwaySheet({ visible, items, leftOnList, keepsOptions, onChange, onConfirm, onClose, loading, onScanReceipt }: PutAwaySheetProps) {
  const styles = useStyles();
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<Zone>>(new Set());
  useEffect(() => {
    if (!visible) {
      setEditing(null);
      setExpanded(new Set());
    }
  }, [visible]);

  const current = editing ? items.find((i) => i.key === editing) : undefined;
  const count = items.length;
  const title = count > 0 ? `Put away ${count} ${count === 1 ? 'item' : 'items'}` : 'Done shopping?';
  const description = current
    ? undefined
    : count > 0
      ? 'We guessed where each one goes and how long it keeps. Tap a line to change it.'
      : 'What you bought comes off your list.';
  const confirmLabel = count > 0 ? `Add ${count} ${count === 1 ? 'item' : 'items'} to pantry` : 'Done shopping';

  return (
    <Sheet
      visible={visible}
      onClose={current ? () => setEditing(null) : onClose}
      title={current ? current.name : title}
      description={description}
      footer={
        current ? (
          <Button label="Done" size="lg" fullWidth onPress={() => setEditing(null)} />
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
            <FoodPicto category={current.category} size="md" />
            {current.quantity ? (
              <Text variant="body" color="inkMuted">
                {current.quantity}
              </Text>
            ) : null}
          </View>
          <PlacementFields
            zone={current.zone}
            onZone={(zone) => onChange(current.key, { zone })}
            keepsDays={current.keepsDays}
            keepsOptions={keepsOptions}
            onKeeps={(keepsDays) => onChange(current.key, { keepsDays })}
            keepsHint={current.expiryLabel ? `Until ${current.expiryLabel}` : 'No date'}
          />
        </>
      ) : (
        <>
          {ZONES.map((zone) => {
            const group = items.filter((i) => i.zone === zone.value);
            if (group.length === 0) return null;
            const open = expanded.has(zone.value) || group.length <= SHOWN + 1;
            const shown = open ? group : group.slice(0, SHOWN);
            return (
              <Field key={zone.value} label={zone.label} aside={`${group.length} ${group.length === 1 ? 'item' : 'items'}`}>
                <ListGroup tone="sunken" inset="none" accessibilityLabel={zone.label}>
                  {shown.map((item) => (
                    <FoodRow
                      key={item.key}
                      tone="sunken"
                      category={item.category}
                      title={item.name}
                      detail={item.quantity || undefined}
                      onPress={() => setEditing(item.key)}
                      accessibilityLabel={`${item.name}${item.quantity ? `, ${item.quantity}` : ''}, ${zone.label}, ${item.expiryLabel ? `keeps until ${item.expiryLabel}` : 'no date'}`}
                      accessibilityHint="Change where it goes and how long it keeps"
                      trailing={<Tag label={item.expiryLabel ?? 'No date'} icon="calendar" variant="outline" />}
                    />
                  ))}
                  {!open ? (
                    <ListRow
                      tone="sunken"
                      title={`${group.length - SHOWN} more`}
                      chevron
                      onPress={() => setExpanded(new Set([...expanded, zone.value]))}
                    />
                  ) : null}
                </ListGroup>
              </Field>
            );
          })}
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
