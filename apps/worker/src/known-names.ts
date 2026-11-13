// The product names offered to the model so it reuses them for name_en. With a text (a page, a caption,
// ingredient lines, names to tidy): only the products one of its words names, household products first,
// most words in common first. Without one (a photo, a video with no caption): household products first,
// then the catalog's, as many as before. A vague household product ("Other", "Sauce") is never among them:
// buildCatalog leaves it out.
import { normalizeText, singularize } from '@mesa/shared';
import type { Catalog } from './mapping';

/** Names sent at most when a text says which are relevant. */
export const MAX_RELEVANT = 150;
/** Names sent at most without a text. */
export const MAX_KNOWN = 400;
/** Words that name no product on their own. */
const MIN_WORD = 3;
const NOT_A_FOOD = new Set(['and', 'the', 'with', 'for', 'fresh', 'dried', 'ground', 'whole', 'large', 'small', 'medium', 'chopped', 'sliced', 'minced', 'cup', 'tbsp', 'tsp', 'del', 'con', 'para', 'les', 'des', 'aux', 'une']);

const wordsOf = (text: string): string[] =>
  normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= MIN_WORD && !NOT_A_FOOD.has(w))
    .map((w) => singularize(w));

const householdFirst = (a: { household_id: string | null }, b: { household_id: string | null }): number =>
  Number(b.household_id !== null) - Number(a.household_id !== null);

/** What a prompt says about the recipe: a text, or its parts (a title, a caption…); missing parts are skipped. */
export type SaidText = string | readonly (string | null | undefined)[] | null | undefined;

export function knownNames(catalog: Catalog | null, text?: SaidText): string[] {
  if (!catalog) return [];
  const said = new Set(wordsOf(typeof text === 'string' ? text : (text ?? []).filter((t): t is string => typeof t === 'string').join('\n')));
  if (said.size === 0) return [...catalog.products].sort(householdFirst).slice(0, MAX_KNOWN).map((p) => p.name_en);

  const scored: { product: (typeof catalog.products)[number]; shared: number }[] = [];
  for (const product of catalog.products) {
    const words = new Set([...(catalog.phrases.get(product.id) ?? [])].flatMap((phrase) => phrase.split(' ')).filter((w) => w.length >= MIN_WORD));
    let shared = 0;
    for (const w of words) if (said.has(w)) shared += 1;
    if (shared > 0) scored.push({ product, shared });
  }
  return scored
    .sort((a, b) => householdFirst(a.product, b.product) || b.shared - a.shared || a.product.name_en.localeCompare(b.product.name_en))
    .slice(0, MAX_RELEVANT)
    .map((s) => s.product.name_en);
}
