import { View } from 'react-native';
import type { Category } from '@mesa/shared';

import { haptics } from '../haptics';
import { createStyles } from '../theme';
import { space } from '../tokens';
import { AisleSection } from './AisleSection';
import { GroceryRow } from './GroceryRow';

export interface GroceryListItem {
  key: string;
  label: string;
  quantity: string;
  tags: string[];
}

export interface GroceryListProps {
  aisles: { category: Category; items: GroceryListItem[] }[];
  cart: GroceryListItem[];
  /** Rows that were just added (they flash once). */
  flashKeys?: ReadonlySet<string>;
  onCheck: (key: string) => void;
  onUncheck: (key: string) => void;
  onEdit: (key: string) => void;
  onHave: (key: string) => void;
  onDelete: (key: string) => void;
}

/** The list by aisle (in AISLE_ORDER), then "In the cart · N" with struck-through rows. */
export function GroceryList({ aisles, cart, flashKeys, onCheck, onUncheck, onEdit, onHave, onDelete }: GroceryListProps) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {aisles.map((aisle) => (
        <AisleSection key={aisle.category} category={aisle.category}>
          {aisle.items.map((item) => (
            <GroceryRow
              key={item.key}
              label={item.label}
              quantity={item.quantity}
              tags={item.tags}
              checked={false}
              flash={flashKeys?.has(item.key)}
              onToggle={() => {
                haptics.check();
                onCheck(item.key);
              }}
              onEdit={() => onEdit(item.key)}
              onHave={() => onHave(item.key)}
              onDelete={() => onDelete(item.key)}
            />
          ))}
        </AisleSection>
      ))}
      {cart.length > 0 ? (
        <AisleSection title={`In the cart · ${cart.length}`}>
          {cart.map((item) => (
            <GroceryRow
              key={item.key}
              label={item.label}
              quantity={item.quantity}
              checked
              onToggle={() => {
                haptics.check();
                onUncheck(item.key);
              }}
              onDelete={() => onDelete(item.key)}
            />
          ))}
        </AisleSection>
      ) : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  list: { gap: space.xxl },
}));
