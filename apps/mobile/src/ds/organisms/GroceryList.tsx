import { AccessibilityInfo } from 'react-native';
import type { Category } from '@mesa/shared';

import { AnimatedList } from '../molecules/AnimatedList';
import { AisleSection } from './AisleSection';
import { GroceryRow } from './GroceryRow';

export interface GroceryListItem {
  key: string;
  label: string;
  /** Right column: "500 g", "2 + 500 g", "". */
  quantity: string;
  /** Recipe names, read by VoiceOver only. */
  forRecipes: string[];
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

/**
 * The list by aisle (in AISLE_ORDER), then "In the cart · N" with struck-through rows.
 * A checked row settles in place, then fades out of its aisle and into the cart while the rest slide up.
 */
export function GroceryList({ aisles, cart, flashKeys, onCheck, onUncheck, onEdit, onHave, onDelete }: GroceryListProps) {
  const toBuy = aisles.reduce((n, a) => n + a.items.length, 0);
  return (
    <AnimatedList gap="xxl">
      {aisles.map((aisle) => (
        <AisleSection key={aisle.category} category={aisle.category} inset="icon">
          {aisle.items.map((item) => (
            <GroceryRow
              key={item.key}
              label={item.label}
              quantity={item.quantity}
              forRecipes={item.forRecipes}
              checked={false}
              flash={flashKeys?.has(item.key)}
              onToggle={() => {
                onCheck(item.key);
                const left = toBuy - 1;
                AccessibilityInfo.announceForAccessibility(
                  `${item.label} in the cart · ${left > 0 ? `${left} to buy` : 'all in the cart'}`,
                );
              }}
              onEdit={() => onEdit(item.key)}
              onHave={() => onHave(item.key)}
              onDelete={() => onDelete(item.key)}
            />
          ))}
        </AisleSection>
      ))}
      {cart.length > 0 ? (
        <AisleSection key="cart" title={`In the cart · ${cart.length}`} inset="icon">
          {cart.map((item) => (
            <GroceryRow
              key={item.key}
              label={item.label}
              quantity={item.quantity}
              checked
              onToggle={() => {
                onUncheck(item.key);
                AccessibilityInfo.announceForAccessibility(`${item.label} back on the list`);
              }}
              onDelete={() => onDelete(item.key)}
            />
          ))}
        </AisleSection>
      ) : null}
    </AnimatedList>
  );
}
