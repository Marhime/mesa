// The Pantry as a list by type of food (tester feedback: "divided by vegetables, fruits, lácteos"): one section per
// family, in FAMILIES order, foods by name. Where a food is kept is not shown, except to tell apart two
// rows of the same food.
import { FAMILIES, FAMILY_LABEL, type Family, type Picto, type Zone } from '@mesa/shared';

import { pantryAmount, type PantryEntry } from './pantry';

export interface PantryRowView {
  key: string;
  name: string;
  picto: Picto;
  /** "6", "500 g", "Plenty", "About half", "Running low". */
  amount: string;
  low: boolean;
  /** Only for a food kept in two places: "In the freezer". */
  detail?: string;
}

export interface PantrySection {
  key: Family;
  title: string;
  rows: PantryRowView[];
}

const ZONE_LINE: Record<Zone, string> = { fridge: 'In the fridge', freezer: 'In the freezer', cupboard: 'In the cupboard' };

export function pantrySections(entries: PantryEntry[]): PantrySection[] {
  const rowsOf = new Map<string, number>();
  for (const e of entries) rowsOf.set(e.product_id, (rowsOf.get(e.product_id) ?? 0) + 1);
  const byName = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return FAMILIES.map((family) => ({
    key: family,
    title: FAMILY_LABEL[family],
    rows: byName
      .filter((e) => e.family === family)
      .map((e) => {
        const amount = pantryAmount(e);
        return {
          key: e.id,
          name: e.name,
          picto: e.picto,
          amount: amount.text,
          low: amount.low,
          detail: (rowsOf.get(e.product_id) ?? 0) > 1 ? ZONE_LINE[e.zone] : undefined,
        };
      }),
  })).filter((s) => s.rows.length > 0);
}
