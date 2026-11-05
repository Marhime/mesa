// Editing a quantity: a number plus a display unit, stored as the normalized unit (g, ml…). Pure.
import { parseUnit, type Unit } from '@mesa/shared';

/** Units offered in the edit sheet. `kg` and `L` are stored as g and ml. */
export const EDIT_UNITS = ['none', 'unit', 'g', 'kg', 'ml', 'L', 'pack', 'can', 'bunch'] as const;
export type EditUnit = (typeof EDIT_UNITS)[number];

export const EDIT_UNIT_LABEL: Record<EditUnit, string> = {
  none: 'No unit',
  unit: 'pcs',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  L: 'L',
  pack: 'pack',
  can: 'can',
  bunch: 'bunch',
};

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Stored quantity → what the edit fields show ("1.5" + "kg" for 1500 g). */
export function toEditable(quantity: number | null, unit: Unit | null): { text: string; unit: EditUnit } {
  if (quantity === null) return { text: '', unit: unit && (EDIT_UNITS as readonly string[]).includes(unit) ? (unit as EditUnit) : 'none' };
  if (unit === 'g' && quantity >= 1000) return { text: trimNumber(quantity / 1000), unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000) return { text: trimNumber(quantity / 1000), unit: 'L' };
  if (unit === null) return { text: trimNumber(quantity), unit: 'none' };
  if ((EDIT_UNITS as readonly string[]).includes(unit)) return { text: trimNumber(quantity), unit: unit as EditUnit };
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
