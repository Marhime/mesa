// Units: parsing free-text units (en/es/fr), scaling, shopping rounding and display.
import type { Unit, UnitFamily } from './types';
import { normalizeText } from './normalize';

type UnitDef = { unit: Unit; factor: number };

const LB_G = 453.592;
const OZ_G = 28.35;
const FL_OZ_ML = 29.5735;

/** Writes every spelling for one unit into the table. Keys are normalized (see unitKey). */
function add(table: Map<string, UnitDef>, unit: Unit, factor: number, spellings: string[]): void {
  for (const s of spellings) table.set(unitKey(s), { unit, factor });
}

/** Lowercase, no accents, dots become spaces, spaces collapsed: "C. à S." → "c a s". */
function unitKey(token: string): string {
  return normalizeText(token.replace(/[.·]/g, ' '));
}

const UNITS: Map<string, UnitDef> = (() => {
  const t = new Map<string, UnitDef>();
  // mass → g
  add(t, 'g', 1, ['g', 'gr', 'grs', 'grm', 'gramo', 'gramos', 'gram', 'grams', 'gramme', 'grammes']);
  add(t, 'g', 1000, ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes']);
  add(t, 'g', 0.001, ['mg', 'miligramo', 'miligramos', 'milligram', 'milligrams', 'milligramme', 'milligrammes']);
  add(t, 'g', LB_G, ['lb', 'lbs', 'libra', 'libras', 'pound', 'pounds', 'livre', 'livres']);
  add(t, 'g', OZ_G, ['oz', 'onza', 'onzas', 'ounce', 'ounces']);
  // volume → ml
  add(t, 'ml', 1, ['ml', 'mls', 'mililitro', 'mililitros', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc', 'cm3']);
  add(t, 'ml', 1000, ['l', 'lt', 'lts', 'ltr', 'ltrs', 'litro', 'litros', 'liter', 'liters', 'litre', 'litres']);
  add(t, 'ml', 10, ['cl', 'centilitro', 'centilitros', 'centiliter', 'centiliters', 'centilitre', 'centilitres']);
  add(t, 'ml', 100, ['dl', 'decilitro', 'decilitros', 'deciliter', 'deciliters', 'decilitre', 'decilitres']);
  add(t, 'ml', FL_OZ_ML, ['fl oz', 'floz', 'fluid ounce', 'fluid ounces']);
  add(t, 'ml', 3785.41, ['gal', 'gallon', 'gallons', 'galon', 'galones']);
  // count
  add(t, 'unit', 1, [
    'unit', 'units', 'pz', 'pzs', 'pza', 'pzas', 'pieza', 'piezas', 'unidad', 'unidades', 'u', 'ud', 'uds',
    'pc', 'pcs', 'piece', 'pieces', 'piece(s)', 'pieza(s)', 'trozo', 'trozos', 'pedazo', 'pedazos', 'morceau', 'morceaux',
    'cabeza', 'cabezas', 'head', 'heads', 'tete', 'tetes', 'botella', 'botellas', 'bottle', 'bottles', 'bouteille',
    'bouteilles', 'frasco', 'frascos', 'jar', 'jars', 'bocal', 'bocaux', 'bote', 'botes', 'tarro', 'tarros',
    'rollo', 'rollos', 'roll', 'rolls', 'rouleau', 'rouleaux',
  ]);
  // spoons and cups
  add(t, 'tbsp', 1, [
    'tbsp', 'tbsps', 'tbs', 'tbl', 'tbls', 'tablespoon', 'tablespoons', 'cda', 'cdas', 'cucharada', 'cucharadas',
    'cucharada sopera', 'cucharadas soperas', 'c a s', 'cas', 'cs', 'cuillere a soupe', 'cuilleres a soupe',
    'cuil a soupe', 'cuill a soupe', 'cuilleree a soupe', 'cuillerees a soupe', 'c a soupe',
  ]);
  add(t, 'tsp', 1, [
    'tsp', 'tsps', 'teaspoon', 'teaspoons', 'cdta', 'cdtas', 'cdita', 'cditas', 'cucharadita', 'cucharaditas',
    'c a c', 'cac', 'cuillere a cafe', 'cuilleres a cafe', 'cuil a cafe', 'cuill a cafe', 'cuilleree a cafe',
    'cuillerees a cafe', 'c a cafe', 'cuillere a the', 'cuilleres a the',
  ]);
  add(t, 'cup', 1, ['cup', 'cups', 'taza', 'tazas', 'tasse', 'tasses']);
  // containers and other counts
  add(t, 'can', 1, ['can', 'cans', 'tin', 'tins', 'lata', 'latas', 'boite', 'boites', 'boite de conserve']);
  add(t, 'bunch', 1, ['bunch', 'bunches', 'manojo', 'manojos', 'ramo', 'ramos', 'atado', 'atados', 'botte', 'bottes']);
  add(t, 'pack', 1, [
    'pack', 'packs', 'paquete', 'paquetes', 'sobre', 'sobres', 'bolsa', 'bolsas', 'package', 'packages', 'packet',
    'packets', 'sachet', 'sachets', 'paquet', 'paquets', 'bag', 'bags', 'caja', 'cajas', 'box', 'boxes', 'pkg',
  ]);
  add(t, 'clove', 1, ['clove', 'cloves', 'diente', 'dientes', 'gousse', 'gousses']);
  add(t, 'pinch', 1, ['pinch', 'pinches', 'pizca', 'pizcas', 'pincee', 'pincees', 'dash', 'dashes']);
  add(t, 'slice', 1, ['slice', 'slices', 'rebanada', 'rebanadas', 'tranche', 'tranches', 'rodaja', 'rodajas', 'loncha', 'lonchas']);
  return t;
})();

/** Longest unit spelling, in words ("cuilleres a soupe" = 3). The parser tries this many tokens. */
export const MAX_UNIT_WORDS = 4;

const GARLIC_SUFFIX = /\s+(?:de ajo|d'ail|d ail|of garlic|garlic)$/;

/**
 * Normalizes a free-text unit: "kg" → {g, 1000}, "cdta" → {tsp, 1}, "lata" → {can, 1}.
 * Mass becomes g and volume ml (factor converts); everything else keeps factor 1.
 * Case matters only for the US shorthand "T" (tbsp) and "t" (tsp).
 */
export function parseUnit(token: string): { unit: Unit; factor: number } | null {
  const trimmed = token.trim();
  if (trimmed.length === 0) return null;
  return lookupUnit(trimmed) ?? lookupUnit(unitKey(trimmed).replace(GARLIC_SUFFIX, ''));
}

/** Exact table lookup used by the parser (no "de ajo" stripping, so the label keeps "ajo"). */
export function lookupUnit(token: string): { unit: Unit; factor: number } | null {
  const trimmed = token.trim();
  if (trimmed === 'T' || trimmed === 'T.' || trimmed === 'Tb' || trimmed === 'Tbs') return { unit: 'tbsp', factor: 1 };
  if (trimmed === 't' || trimmed === 't.') return { unit: 'tsp', factor: 1 };
  const key = unitKey(trimmed);
  if (key.length === 0) return null;
  const def = UNITS.get(key) ?? UNITS.get(key.replace(/\s+/g, ''));
  return def ? { unit: def.unit, factor: def.factor } : null;
}

/** Mass for g, volume for ml and kitchen measures, count for things you count, other for pinch/null. */
export function unitFamily(unit: Unit | null): UnitFamily {
  switch (unit) {
    case 'g':
      return 'mass';
    case 'ml':
    case 'tbsp':
    case 'tsp':
    case 'cup':
      return 'volume';
    case 'unit':
    case 'can':
    case 'pack':
    case 'bunch':
    case 'clove':
    case 'slice':
      return 'count';
    default:
      return 'other';
  }
}

/** Rounds half away from zero to `decimals` places without binary drift (1.005 → 1.01). */
export function roundTo(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  // 12 significant digits drop binary noise (59.46 * 1 / 12 = 4.954999999999999 → 4.955), so halves
  // round like Postgres numeric does.
  const clean = Number(Math.abs(n).toPrecision(12));
  const shifted = Number(`${clean}e${decimals}`);
  return sign * Number(`${Math.round(shifted)}e-${decimals}`);
}

/** quantity × to / from, in that order (as SQL plan_recipe does). Null stays null. */
export function scaleQuantity(q: number | null, fromServings: number, toServings: number): number | null {
  if (q === null || !Number.isFinite(q)) return null;
  if (!Number.isFinite(fromServings) || !Number.isFinite(toServings) || fromServings <= 0) return q;
  return (q * toServings) / fromServings;
}

const CEIL_UNITS: ReadonlySet<string> = new Set(['unit', 'can', 'pack', 'bunch', 'clove', 'slice', 'g', 'ml']);

/**
 * Mirrors SQL public.round_for_shopping exactly:
 * null → null; no unit or a countable unit or g/ml → ceil; anything else → round to 2 decimals.
 * Float noise (11.000000000000002) is removed before ceil so results match Postgres numeric.
 */
export function roundForShopping(q: number | null, unit: Unit | null): number | null {
  if (q === null || !Number.isFinite(q)) return null;
  if (unit === null || CEIL_UNITS.has(unit)) {
    return Math.ceil(roundTo(q, 9)) + 0; // + 0 turns -0 into 0
  }
  return roundTo(q, 2) + 0;
}

/** Number without trailing zeros, at most `decimals` places: 1.50 → "1.5", 2 → "2". */
export function formatNumber(n: number, decimals = 2): string {
  return String(roundTo(n, decimals) + 0);
}

const FRACTION_GLYPHS: Array<[number, string]> = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

/** 1.5 → "1½", 0.25 → "¼", 0.6 → "0.6" (only quarters, halves and thirds become glyphs). */
function formatKitchenNumber(q: number): string {
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  if (frac < 0.01) return String(whole);
  for (const [value, glyph] of FRACTION_GLYPHS) {
    if (Math.abs(frac - value) < 0.01) return whole === 0 ? glyph : `${whole}${glyph}`;
  }
  return formatNumber(q);
}

const UNIT_LABEL: Record<Exclude<Unit, 'g' | 'ml' | 'unit'>, [string, string]> = {
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
 * Display text for a quantity: "500 g", "1.5 kg", "250 ml", "1.5 L", "2" (unit), "2 tbsp",
 * "½ cup", "1½ cups", "2 cans", "" when the quantity is null.
 */
export function formatQuantity(q: number | null, unit: Unit | null): string {
  if (q === null || !Number.isFinite(q)) return '';
  switch (unit) {
    case null:
    case 'unit':
      return formatNumber(q);
    case 'g':
      return q >= 1000 ? `${formatNumber(q / 1000)} kg` : `${formatNumber(q)} g`;
    case 'ml':
      return q >= 1000 ? `${formatNumber(q / 1000)} L` : `${formatNumber(q)} ml`;
    case 'cup':
    case 'tbsp':
    case 'tsp': {
      const [one, many] = UNIT_LABEL[unit];
      return `${formatKitchenNumber(q)} ${q > 1 ? many : one}`;
    }
    default: {
      const [one, many] = UNIT_LABEL[unit];
      return `${formatNumber(q)} ${q > 1 ? many : one}`;
    }
  }
}
