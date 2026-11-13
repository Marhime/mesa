// Editing a quantity: a number plus a display unit, stored as the normalized unit (g, ml…). Pure.
import { parseUnit, type Unit } from '@mesa/shared';

/** Every unit an amount can be typed in. `kg` and `L` are stored as g and ml. */
export const ALL_EDIT_UNITS = ['none', 'unit', 'g', 'kg', 'ml', 'L', 'tbsp', 'tsp', 'cup', 'pack', 'can', 'bunch', 'clove', 'pinch', 'slice'] as const;
export type EditUnit = (typeof ALL_EDIT_UNITS)[number];

/** What you buy or keep (groceries, pantry). */
export const EDIT_UNITS: readonly EditUnit[] = ['none', 'unit', 'g', 'kg', 'ml', 'L', 'pack', 'can', 'bunch'];
/** What a recipe asks for: kitchen measures too. */
export const RECIPE_EDIT_UNITS: readonly EditUnit[] = ['none', 'unit', 'g', 'kg', 'ml', 'L', 'tbsp', 'tsp', 'cup', 'clove', 'pinch', 'slice', 'can', 'bunch'];

export const EDIT_UNIT_LABEL: Record<EditUnit, string> = {
  none: 'No unit',
  unit: 'pcs',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  L: 'L',
  tbsp: 'tbsp',
  tsp: 'tsp',
  cup: 'cup',
  pack: 'pack',
  can: 'can',
  bunch: 'bunch',
  clove: 'clove',
  pinch: 'pinch',
  slice: 'slice',
};

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Stored quantity → what the edit fields show ("1.5" + "kg" for 1500 g), among the units offered. */
export function toEditable(quantity: number | null, unit: Unit | null, units: readonly EditUnit[] = EDIT_UNITS): { text: string; unit: EditUnit } {
  const offered = (u: string): u is EditUnit => (units as readonly string[]).includes(u);
  if (quantity === null) return { text: '', unit: unit && offered(unit) ? unit : 'none' };
  if (unit === 'g' && quantity >= 1000) return { text: trimNumber(quantity / 1000), unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000) return { text: trimNumber(quantity / 1000), unit: 'L' };
  if (unit === null) return { text: trimNumber(quantity), unit: 'none' };
  if (offered(unit)) return { text: trimNumber(quantity), unit };
  return { text: trimNumber(quantity), unit: 'none' };
}

/** Edit fields → stored quantity. Returns undefined when the number is not readable. */
export function fromEditable(text: string, unit: EditUnit): { quantity: number | null; unit: Unit | null } | undefined {
  const t = text.trim().replace(',', '.');
  if (t.length === 0) return { quantity: null, unit: unit === 'none' ? null : (parseUnit(unit)?.unit ?? null) };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (unit === 'none') return { quantity: n, unit: null };
  const parsed = parseUnit(unit);
  if (!parsed) return { quantity: n, unit: null };
  return { quantity: Math.round(n * parsed.factor * 1000) / 1000, unit: parsed.unit };
}

/** Two edit states that store the same amount ("2" and "2.0", 1.5 kg and 1500 g, any unit with no number). */
export function sameEditable(a: { text: string; unit: EditUnit }, b: { text: string; unit: EditUnit }): boolean {
  const x = fromEditable(a.text, a.unit);
  const y = fromEditable(b.text, b.unit);
  if (!x || !y) return a.text.trim() === b.text.trim() && a.unit === b.unit;
  return x.quantity === y.quantity && (x.quantity === null || x.unit === y.unit);
}
