// How an amount reads: one rule for recipes, groceries, the pantry and scans.
// - g and ml stay metric, at most 2 decimals: "500 g", "1.5 kg", "250 ml", "1.5 L".
// - tbsp, tsp and cups: the nearest kitchen fraction (⅛ ¼ ⅓ ½ ⅔ ¾): "¾ tbsp", "1⅛ tbsp", "1½ cups".
// - Things you count (no unit, pieces, cans, cloves, bunches, packs, slices, pinches) never show a decimal.
//   Under 1: the nearest of ¼ ⅓ ½ ⅔ ¾ ("¾ onion"). From 1: a whole number, or a half when the amount is
//   closer to the half than a quarter is (1.5 → "1½", 2.4 → "2½", 2.25 → "2", 3.75 → "4"): a quarter of a
//   bay leaf or a carrot is noise once you need more than one.
import type { Unit } from './types';
import { roundTo } from './units';

type Fraction = readonly [value: number, glyph: string];

const KITCHEN: readonly Fraction[] = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
const PART_OF_ONE: readonly Fraction[] = [[1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];

/** The text shown and the value it stands for (singular or plural is decided on the value). */
interface Shown {
  text: string;
  value: number;
}

/** Number without trailing zeros, at most 2 places: 1.50 → "1.5", 2 → "2". */
function metric(n: number): string {
  return String(roundTo(n, 2) + 0);
}

/** The closest fraction; the first one on a tie. */
function nearest(frac: number, options: readonly Fraction[]): Fraction {
  let best = options[0]!;
  for (const f of options) if (Math.abs(frac - f[0]) < Math.abs(frac - best[0]) - 1e-9) best = f;
  return best;
}

function withFraction(whole: number, [value, glyph]: Fraction): Shown {
  if (value === 1) return { text: String(whole + 1), value: whole + 1 };
  if (glyph === '') return { text: String(whole), value: whole };
  return { text: whole === 0 ? glyph : `${whole}${glyph}`, value: whole + value };
}

/** Spoons and cups: 1.125 → "1⅛", 0.75 → "¾"; an amount above zero never reads "0". */
function kitchen(q: number): Shown {
  const whole = Math.floor(q);
  return withFraction(whole, nearest(q - whole, whole === 0 ? KITCHEN.slice(1) : KITCHEN));
}

/** Whole things: 0.75 → "¾", 2.25 → "2", 2.4 → "2½", 3.75 → "4". */
function counted(q: number): Shown {
  if (q < 1) return withFraction(0, nearest(q, PART_OF_ONE));
  const whole = Math.floor(q);
  if (Math.abs(q - whole - 0.5) < 0.25) return { text: `${whole}½`, value: whole + 0.5 };
  const n = Math.round(q);
  return { text: String(n), value: n };
}

function shown(q: number, unit: Unit | null): Shown {
  const clean = roundTo(q, 6); // scaling noise: 2.2500000000000004 is 2.25
  if (clean <= 0) return { text: metric(clean), value: clean };
  return unit === 'tbsp' || unit === 'tsp' || unit === 'cup' ? kitchen(clean) : counted(clean);
}

const UNIT_LABEL: Record<Exclude<Unit, 'g' | 'ml' | 'unit'>, readonly [one: string, many: string]> = {
  tbsp: ['tbsp', 'tbsp'],
  tsp: ['tsp', 'tsp'],
  cup: ['cup', 'cups'],
  can: ['can', 'cans'],
  bunch: ['bunch', 'bunches'],
  pack: ['pack', 'packs'],
  clove: ['clove', 'cloves'],
  pinch: ['pinch', 'pinches'],
  slice: ['slice', 'slices'],
};

/**
 * Display text for a quantity: "500 g", "1.5 kg", "250 ml", "1.5 L", "2" (unit), "¾", "2 tbsp", "1⅛ tbsp",
 * "½ cup", "1½ cups", "2 cans", "" when the quantity is null. `word` is the measure the line used when it
 * has no unit code ("1 thumb ginger" → "¾ thumb"); it is ignored when there is a unit.
 */
export function formatQuantity(q: number | null, unit: Unit | null, word?: string | null): string {
  if (q === null || !Number.isFinite(q)) return '';
  if (unit === 'g') return q >= 1000 ? `${metric(q / 1000)} kg` : `${metric(q)} g`;
  if (unit === 'ml') return q >= 1000 ? `${metric(q / 1000)} L` : `${metric(q)} ml`;
  const amount = shown(q, unit);
  if (unit === null) return word ? `${amount.text} ${word}` : amount.text;
  if (unit === 'unit') return amount.text;
  const [one, many] = UNIT_LABEL[unit];
  return `${amount.text} ${amount.value > 1 ? many : one}`;
}
