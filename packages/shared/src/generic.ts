// Names too vague to be a product of their own: placeholders ("other", "misc") and a bare head noun whose
// qualifier is the product ("sauce" said of fish sauce, "spice" of star anise). An import may read one (a
// model's name_en, a receipt line); it never becomes a household product, is never offered to a model as a
// known product and never matches a household product. A curated catalog alias may still be one ("oil" →
// Cooking oil): someone chose it.
// public.is_vague_name (supabase/migrations/20261106000021_vague_products.sql) holds the same lists; plural
// forms are written out because SQL cannot singularize.
import { normalizeText, singularize } from './normalize';

/** Words that only hold a place. Several of them, or one with a vague head, are vague too ("misc grocery", "other sauce"). */
export const PLACEHOLDER_WORDS: readonly string[] = [
  'other', 'others', 'misc', 'miscellaneous', 'various', 'assorted', 'item', 'items', 'ingredient', 'ingredients',
  'food', 'foods', 'product', 'products', 'thing', 'things', 'stuff', 'grocery', 'groceries', 'unknown', 'none', 'null',
  'otro', 'otros', 'otra', 'otras', 'varios', 'producto', 'productos', 'autre', 'autres', 'divers', 'produit', 'produits',
];

/** Head nouns that say nothing alone: the word before them is what you buy ("fish sauce", "garlic powder"). */
export const VAGUE_HEADS: readonly string[] = [
  'sauce', 'sauces', 'seasoning', 'seasonings', 'spice', 'spices', 'condiment', 'condiments', 'paste', 'pastes',
  'powder', 'powders', 'oil', 'oils', 'herb', 'herbs', 'vegetable', 'vegetables', 'veggie', 'veggies', 'mix', 'mixes',
  'garnish', 'garnishes', 'topping', 'toppings',
];

/** Vague names of several words that are not made of placeholders. */
export const VAGUE_PHRASES: readonly string[] = ['spice mix', 'spice blend', 'seasoning mix', 'seasoning blend', 'n/a'];

/** Normalized, singularized words: "Spices", "spice" and " SPICE " are the same name. */
const words = (s: string): string[] =>
  normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => singularize(w));
const keys = (list: readonly string[]): ReadonlySet<string> => new Set(list.map((s) => words(s).join(' ')));

const PLACEHOLDERS = keys(PLACEHOLDER_WORDS);
const HEADS = keys(VAGUE_HEADS);
const PHRASES = keys(VAGUE_PHRASES);

/** True for "Other", "misc", "Sauce", "spices", "other items"; false for "fish sauce", "vegetable oil" and "". */
export function isGenericName(name: string): boolean {
  const ws = words(name);
  if (ws.length === 0) return false;
  const key = ws.join(' ');
  if (PHRASES.has(key) || HEADS.has(key)) return true;
  return ws.some((w) => PLACEHOLDERS.has(w)) && ws.every((w) => PLACEHOLDERS.has(w) || HEADS.has(w));
}

/** A name a matcher must not index: a household product (or alias) that names nothing specific. */
export function isVaguePhrase(product: { household_id: string | null }, phrase: string): boolean {
  return product.household_id !== null && isGenericName(phrase);
}
