import type { Category } from '@mesa/shared';

import { Chip } from '../atoms/Chip';
import { Tag } from '../atoms/Tag';
import { Meta } from '../molecules/Meta';
import { FoodRow } from './FoodRow';

export interface IngredientRowProps {
  name: string;
  /** Scaled, formatted quantity ("375 g"); empty when none. */
  quantity: string;
  category: Category;
  /** At home or to buy; omitted while the pantry loads. */
  status?: 'have' | 'buy';
  /** At home and should be used soon. */
  soon?: boolean;
  /** The source did not give the amount: we guessed it. */
  estimated?: boolean;
  optional?: boolean;
  /** Fix a guessed amount (opens the editor). */
  onPress?: () => void;
  /** "To buy" becomes a button: it's actually at home. */
  onMarkHave?: () => void;
}

/** One ingredient: picto, name, amount, and whether it is at home ("Have") or on the way ("To buy"). */
export function IngredientRow({ name, quantity, category, status, soon, estimated, optional, onPress, onMarkHave }: IngredientRowProps) {
  const amount = estimated && quantity ? `About ${quantity}` : quantity;
  const detail = [
    amount || null,
    soon ? 'use soon' : null,
    optional ? 'optional' : null,
    estimated ? (onPress ? 'guessed, tap to fix' : 'guessed') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const statusText = status === 'have' ? 'have it' : status === 'buy' ? 'to buy' : null;
  return (
    <FoodRow
      category={category}
      title={name}
      detail={detail || undefined}
      detailIcon={estimated ? 'warning' : undefined}
      onPress={estimated ? onPress : undefined}
      accessibilityLabel={[name, detail, statusText].filter(Boolean).join(', ')}
      accessibilityHint={estimated && onPress ? 'Opens the editor to fix the amount' : undefined}
      trailing={
        status === 'have' ? (
          <Meta icon="checkCircle" text="Have" tone="success" strong />
        ) : status === 'buy' ? (
          onMarkHave ? (
            <Chip label="To buy" accessibilityLabel={`${name}: to buy`} accessibilityHint="Marks it as at home" onPress={onMarkHave} />
          ) : (
            <Tag label="To buy" variant="outline" />
          )
        ) : undefined
      }
    />
  );
}
