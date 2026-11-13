// A grocery line as the list shows it (Karla: "focused on a grocery list - quantity/weight"): the amount to
// buy on the right, the recipes it is for only in the item sheet. Pure.
import { formatQuantity, type GroceryItem, type Unit } from '@mesa/shared';

import type { GroceryLine } from './groceryCache';

/** Kitchen measures are not something you buy: "1 tsp salt" is just "salt" in the store. */
const KITCHEN_UNITS: ReadonlySet<Unit> = new Set<Unit>(['tbsp', 'tsp', 'pinch', 'cup']);

/** "500 g", "2", "" for a line's own amount (put away, edit sheet). */
export function lineQuantity(line: Pick<GroceryItem, 'quantity' | 'unit'>): string {
  return formatQuantity(line.quantity, line.unit);
}

/**
 * What to buy: the line's amount plus what a recipe asked for in another unit ("2 + 500 g"; the database
 * can only add up the same unit). Kitchen measures and zero are left out; "" when nothing is counted.
 */
export function lineAmount(line: Pick<GroceryLine, 'quantity' | 'unit' | 'recipes'>): string {
  const byUnit = new Map<Unit | null, number>();
  const add = (quantity: number | null, unit: Unit | null) => {
    if (quantity === null || quantity <= 0 || (unit !== null && KITCHEN_UNITS.has(unit))) return;
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + quantity);
  };
  add(line.quantity, line.unit);
  for (const r of line.recipes) if ((r.unit ?? null) !== (line.unit ?? null)) add(r.quantity, r.unit);
  return [...byUnit].map(([unit, quantity]) => formatQuantity(quantity, unit)).filter(Boolean).join(' + ');
}

/** The recipes a line is for, with what each asked for: "Tinga · 500 g". */
export function lineRecipes(line: Pick<GroceryLine, 'recipes'>): { title: string; amount: string }[] {
  const byTitle = new Map<string, { title: string; amount: string }>();
  for (const r of line.recipes) {
    if (byTitle.has(r.recipe_title)) continue;
    byTitle.set(r.recipe_title, { title: r.recipe_title, amount: formatQuantity(r.quantity, r.unit) });
  }
  return [...byTitle.values()];
}

export interface GroceryListRow {
  key: string;
  label: string;
  /** Right column: "500 g", "2 + 500 g", "". */
  quantity: string;
  /** Recipe names, read by VoiceOver as a hint ("For Tinga and Pozole"). */
  forRecipes: string[];
}

export function toListItem(line: GroceryLine): GroceryListRow {
  return { key: line.key, label: line.label, quantity: lineAmount(line), forRecipes: lineRecipes(line).map((r) => r.title) };
}
