// Pure mapping from extracted ingredients to recipe_ingredients rows (+ household products to create).
import {
  buildCatalogIndex,
  capitalize,
  cleanSection,
  isGenericName,
  isVaguePhrase,
  matchProduct,
  normalizeText,
  parseIngredientLine,
  parseUnit,
  singularize,
  unitFamily,
  type CatalogIndex,
  type Category,
  type ExtractedIngredient,
  type Product,
  type ProductAlias,
  type Unit,
  type UnitFamily,
  type Zone,
} from '@mesa/shared';

/** The index plus what the sanity checks need: every phrase (name and aliases) of each product. */
export interface Catalog {
  readonly index: CatalogIndex;
  readonly products: readonly Product[];
  /** product id → normalized, singularized phrases. */
  readonly phrases: ReadonlyMap<string, ReadonlySet<string>>;
}

const words = (s: string): string[] => normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length > 0);
/** Normalized, singularized words: "Cherry Tomatoes" and "cherry tomato" are the same phrase. */
export const phraseKey = (s: string): string => words(s).map((w) => singularize(w)).join(' ');

/**
 * The matching catalog. A vague household product is left out with its aliases (they are the lines it
 * swallowed: "star anise" on "Other"), so it is never matched nor offered to the model as a known name.
 */
export function buildCatalog(products: Product[], aliases: ProductAlias[]): Catalog {
  const usable = products.filter((p) => !isVaguePhrase(p, p.name_en));
  const byId = new Map(usable.map((p) => [p.id, p]));
  const kept = aliases.filter((a) => {
    const p = byId.get(a.product_id);
    return p !== undefined && !isVaguePhrase(p, a.alias);
  });
  const phrases = new Map<string, Set<string>>();
  const add = (id: string, text: string): void => {
    const key = phraseKey(text);
    if (key === '') return;
    let set = phrases.get(id);
    if (!set) phrases.set(id, (set = new Set()));
    set.add(key);
  };
  for (const p of usable) add(p.id, p.name_en);
  for (const a of kept) add(a.product_id, a.alias);
  return { index: buildCatalogIndex(usable, kept), products: usable, phrases };
}

// chile, chili and pepper name the same thing at the end of an English product name
const HEAD_SYNONYMS: Record<string, string> = { chile: 'pepper', chili: 'pepper', chilli: 'pepper', chiles: 'pepper' };
const head = (phrase: string): string => {
  const last = phrase.split(' ').pop() ?? '';
  return HEAD_SYNONYMS[last] ?? last;
};

/** The label is the product's name or one of its aliases (singular/plural and accents ignored). */
export function isExactMatch(catalog: Catalog, product: Product, label: string): boolean {
  return catalog.phrases.get(product.id)?.has(phraseKey(label)) ?? false;
}
const isExact = isExactMatch;

// Heads whose qualifier is the product: fish sauce is not Soy sauce, sesame oil is not Cooking oil, balsamic
// vinegar is not Vinegar. A partial match on one of them only adds words that change nothing (NEUTRAL).
// Broth and stock are left out on purpose: the catalog's Broth stands for every broth.
const QUALIFIED_HEADS: ReadonlySet<string> = new Set(['sauce', 'paste', 'powder', 'seasoning', 'oil', 'vinegar']);
const NEUTRAL: ReadonlySet<string> = new Set(
  // Not "dark": dark soy sauce is its own bottle.
  ['fresh', 'pure', 'plain', 'regular', 'neutral', 'light', 'low', 'reduced', 'sodium', 'organic', 'homemade',
    'store', 'bought', 'good', 'quality', 'natural', 'distilled', 'premium'].map((w) => singularize(w)),
);

/** "light soy sauce" over "soy sauce": the phrase ends the name and only neutral words come before it. */
function onlyNeutralBefore(name: readonly string[], phrase: readonly string[]): boolean {
  const extra = name.length - phrase.length;
  if (extra < 0 || phrase.some((w, i) => name[extra + i] !== w)) return false;
  return name.slice(0, extra).every((w) => NEUTRAL.has(w));
}

/**
 * English names put the noun last: "chicken stock" must not become Chicken, "white onion" may become Onion.
 * For a qualified head the qualifier must not change: "fish sauce" is neither "Sauce" nor "Soy sauce".
 */
function sameHead(catalog: Catalog, product: Product, nameEn: string): boolean {
  const name = phraseKey(nameEn);
  const want = head(name);
  if (want === '') return false;
  for (const p of catalog.phrases.get(product.id) ?? []) {
    if (head(p) !== want) continue;
    if (!QUALIFIED_HEADS.has(want) || onlyNeutralBefore(name.split(' '), p.split(' '))) return true;
  }
  return false;
}

/**
 * The first name that says what the thing is, in order of preference (name_en, then the line's own label):
 * "other" or "sauce" for fish sauce don't. A vague name only when nothing better is given ("2 tbsp oil").
 */
export function specificName(...names: readonly string[]): string {
  const given = names.map((n) => n.trim()).filter((n) => n !== '');
  return given.find((n) => !isGenericName(n)) ?? given[0] ?? '';
}

/**
 * Product for one ingredient: matchProduct on name_en first, then on the cleaned raw label. A vague name_en
 * ("other", "sauce") gives way to the label (see specificName). A partial match is accepted only when it
 * keeps the English head noun of that name, so "chicken stock" never lands on Chicken, "tomato paste" never
 * on Tomato and "fish sauce" never on a sauce. Without any name_en, a partial label match is trusted.
 */
export function matchIngredient(catalog: Catalog, nameEnAsGiven: string, rawLabel: string): Product | null {
  const nameEn = isGenericName(nameEnAsGiven) ? specificName(nameEnAsGiven, rawLabel) : nameEnAsGiven.trim();
  if (nameEn !== '') {
    const p = matchProduct(catalog.index, nameEn);
    if (p && (isExact(catalog, p, nameEn) || sameHead(catalog, p, nameEn))) return p;
  }
  if (rawLabel.trim() !== '') {
    const q = matchProduct(catalog.index, rawLabel);
    if (q && (isExact(catalog, q, rawLabel) || nameEn === '' || sameHead(catalog, q, nameEn))) return q;
  }
  return null;
}

// Size words used as a "unit" by models and sites ("2 medium onions"): they count whole things.
const SIZE_WORDS = new Set([
  'small', 'medium', 'large', 'big', 'whole', 'extra large', 'grande', 'grandes', 'mediano', 'mediana', 'medianos',
  'medianas', 'chico', 'chica', 'chicos', 'chicas', 'pequeno', 'pequena', 'pequenos', 'pequenas', 'entero', 'entera',
  'enteros', 'enteras', 'petit', 'petite', 'moyen', 'moyenne', 'gros', 'grosse', 'entier', 'entiere',
]);
const MAX_UNKNOWN_UNIT_COUNT = 12;

/**
 * Quantity and unit as stored: mass → g, volume → ml (factor applied), counts → "unit".
 * An unknown unit keeps only a small count ("3 ramitas" → 3, no unit), otherwise nothing.
 */
export function normalizeQuantity(quantity: number | null, unitText: string | null): { quantity: number | null; unit: Unit | null } {
  const q = quantity !== null && Number.isFinite(quantity) && quantity > 0 ? quantity : null;
  if (q === null) return { quantity: null, unit: null };
  const text = unitText?.trim() ?? '';
  if (text === '') return { quantity: round(q), unit: 'unit' };
  const parsed = parseUnit(text);
  if (parsed) {
    const value = round(q * parsed.factor);
    return value > 0 && value <= 1_000_000 ? { quantity: value, unit: parsed.unit } : { quantity: null, unit: null };
  }
  if (SIZE_WORDS.has(normalizeText(text))) return { quantity: round(q), unit: 'unit' };
  return q <= MAX_UNKNOWN_UNIT_COUNT ? { quantity: round(q), unit: null } : { quantity: null, unit: null };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function zoneForCategory(category: Category): Zone {
  if (category === 'produce' || category === 'meat' || category === 'dairy') return 'fridge';
  if (category === 'frozen') return 'freezer';
  return 'cupboard';
}

export interface IngredientRow {
  position: number;
  raw_text: string;
  name: string;
  product_id: string | null;
  quantity: number | null;
  unit: Unit | null;
  is_guessed: boolean;
  is_optional: boolean;
  /** The part of the recipe it belongs to ("Marinade", "Sauce"); null for a recipe with one list. */
  section: string | null;
}

/** A household product to create because nothing in the catalog matched. */
export interface NewProduct {
  /** normalizeText(name_en): one product per key, shared by every ingredient that needs it. */
  key: string;
  name_en: string;
  category: Category;
  default_zone: Zone;
  unit_family: UnitFamily;
  /** Normalized aliases: name_en and the cleaned raw label. */
  aliases: string[];
}

export interface PlannedIngredient {
  row: IngredientRow;
  /** Set when row.product_id must be filled with the NewProduct of this key. */
  newProductKey: string | null;
}

export interface IngredientPlan {
  ingredients: PlannedIngredient[];
  newProducts: NewProduct[];
}

/**
 * Maps every ingredient to its row; unmatched names become (deduplicated) household products, except a
 * vague one ("Sauce" when the line says only "sauce"), which stays a plain line.
 */
export function planIngredients(ingredients: readonly ExtractedIngredient[], catalog: Catalog): IngredientPlan {
  const planned: PlannedIngredient[] = [];
  const newProducts = new Map<string, NewProduct>();

  ingredients.forEach((ing, position) => {
    const rawText = ing.raw_text.trim();
    const rawLabel = parseIngredientLine(rawText).label;
    // What it is called when no product matches: never "Other" or "Sauce" when the line says more.
    const nameEn = specificName(ing.name_en, rawLabel);
    const { quantity, unit } = normalizeQuantity(ing.quantity, ing.unit);
    const base = {
      position,
      raw_text: rawText !== '' ? rawText : nameEn,
      quantity,
      unit,
      is_guessed: quantity !== null && ing.is_guessed,
      is_optional: ing.is_optional,
      // Each line keeps its own: dark soy sauce in the marinade and in the sauce are two lines, one product.
      section: cleanSection(ing.section),
    };

    const product = matchIngredient(catalog, ing.name_en, rawLabel);
    if (product) {
      // The recipe says what the line says ("Dark soy sauce", "Red onion"); the product is only its link to
      // the pantry and the list.
      planned.push({ row: { ...base, name: capitalize(nameEn), product_id: product.id }, newProductKey: null });
      return;
    }

    const displayName = capitalize(nameEn);
    const key = normalizeText(displayName);
    // Nothing specific to name a product after ("2 tbsp sauce"): the line keeps its word, unlinked.
    if (key === '' || isGenericName(displayName)) {
      planned.push({ row: { ...base, name: displayName || base.raw_text, product_id: null }, newProductKey: null });
      return;
    }
    let np = newProducts.get(key);
    if (!np) {
      const category = ing.category ?? 'other';
      np = {
        key,
        name_en: displayName,
        category,
        default_zone: zoneForCategory(category),
        unit_family: unitFamily(unit),
        aliases: [],
      };
      newProducts.set(key, np);
    }
    for (const alias of [normalizeText(displayName), normalizeText(rawLabel)]) {
      if (alias !== '' && /\p{L}/u.test(alias) && !isGenericName(alias) && !np.aliases.includes(alias)) np.aliases.push(alias);
    }
    planned.push({ row: { ...base, name: displayName, product_id: null }, newProductKey: key });
  });

  return { ingredients: planned, newProducts: [...newProducts.values()] };
}

/** Fills product ids once the new products exist; an ingredient whose product failed keeps product_id null. */
export function resolveRows(plan: IngredientPlan, created: ReadonlyMap<string, Product>): IngredientRow[] {
  return plan.ingredients.map(({ row, newProductKey }) => {
    if (newProductKey === null) return row;
    const p = created.get(newProductKey);
    return p ? { ...row, product_id: p.id } : row;
  });
}
