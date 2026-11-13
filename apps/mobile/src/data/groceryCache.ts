// The grocery list in the query cache: fetching it, keys that survive the temp → real id swap, merges
// that mirror add_grocery_item, and refreshes after writes. Shared by groceries.ts and groceryAdd.ts.
import { type GroceryItem, type Unit } from '@mesa/shared';
import { type QueryClient } from '@tanstack/react-query';

import { GROCERIES_KEY, USUAL_KEY } from './keys';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

/** A line on the list, with the recipes it is for and a key that survives the temp → real id swap. */
export interface GroceryLine extends GroceryItem {
  key: string;
  /** What each recipe on the menu asked for (its own amount, maybe in another unit than the line). */
  recipes: { up_next_id: string; recipe_title: string; quantity: number | null; unit: Unit | null }[];
}

export { USUAL_KEY };

// Optimistic rows get a temp id; once the server answers, the real id keeps the temp key
// so the row does not remount (and does not flash twice).
export const keyByRealId = new Map<string, string>();
let tempCounter = 0;

/** A new temp id for an optimistic row. */
export function nextTempId(): string {
  return `temp-${++tempCounter}`;
}

export function keyOf(id: string): string {
  return keyByRealId.get(id) ?? id;
}

type Row = GroceryItem & { grocery_item_recipes: GroceryLine['recipes'] | null };

const COLUMNS =
  'id, household_id, label, product_id, quantity, unit, category, status, source, checked_at, bought_at, created_at, updated_at, grocery_item_recipes(up_next_id, recipe_title, quantity, unit)';

export async function fetchGroceries(): Promise<GroceryLine[]> {
  const rows = must(
    await supabase.from('grocery_items').select(COLUMNS).in('status', ['to_buy', 'in_cart']).order('created_at', { ascending: true }),
  ) as unknown as Row[];
  return rows.map(({ grocery_item_recipes, ...item }) => ({
    ...item,
    quantity: item.quantity === null ? null : Number(item.quantity),
    key: keyOf(item.id),
    recipes: (grocery_item_recipes ?? []).map((r) => ({ ...r, quantity: r.quantity === null ? null : Number(r.quantity) })),
  }));
}

export function sameLine(a: { product_id: string | null; label: string }, b: { product_id: string | null; label: string }): boolean {
  if (a.product_id) return a.product_id === b.product_id;
  return !b.product_id && a.label.trim().toLowerCase() === b.label.trim().toLowerCase();
}

/** Mirrors the SQL merge of add_grocery_item. */
export function mergeQuantity(item: GroceryLine, quantity: number | null, unit: Unit | null): Pick<GroceryLine, 'quantity' | 'unit'> {
  if (quantity !== null && item.quantity !== null && (item.unit ?? '') === (unit ?? '')) {
    return { quantity: item.quantity + quantity, unit: item.unit };
  }
  if (item.quantity === null && quantity !== null) return { quantity, unit };
  return { quantity: item.quantity, unit: item.unit };
}

/** The list reads again once the last of this phone's grocery writes settles (the one settling counts). */
export function invalidateWhenIdle(qc: QueryClient): void {
  if (qc.isMutating({ mutationKey: GROCERIES_KEY }) <= 1) refresh(qc, 'groceries');
}

export function setLines(qc: QueryClient, update: (lines: GroceryLine[]) => GroceryLine[]): void {
  qc.setQueryData<GroceryLine[]>(GROCERIES_KEY, (cur) => update(cur ?? []));
}

