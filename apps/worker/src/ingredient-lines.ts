// Ingredient lines read one by one (a website's JSON-LD list, or a saved recipe read again): the amount
// from the line itself (parseIngredientLine), the English name from the catalog when the label is exactly
// a product, else from one batched model call. A website's heading lines ("For the sauce:") are its
// sections, not ingredients.
import { parseIngredientLine, readSections, type ExtractedIngredient } from '@mesa/shared';
import { isAbortError } from './errors';
import { withSections } from './ingredient-sections';
import type { Logger } from './log';
import { isExactMatch, matchIngredient, type Catalog } from './mapping';
import type { Translation } from './model-output';

/** Names the lines given ({i, line}: i is the line's index); the model call in production. */
export type TranslateLines = (pending: Array<{ i: number; line: string }>) => Promise<Map<number, Translation>>;

const OPTIONAL_LINE = /\b(?:opcional|optional|facultatif|para decorar|para servir|for garnish|to serve|pour servir)\b/i;

/**
 * One entry per line, in the same order: null for a line nothing names (no letters, or no label and no
 * translation). Lines whose label is exactly a catalog product need nothing else; the rest get name_en +
 * category from one `translate` call (skipped when every line matched). A failed call is thrown; a line
 * the answer left out falls back to its own label (as the app does for typed groceries).
 */
export async function readIngredientLines(
  lines: readonly string[],
  catalog: Catalog,
  translate: TranslateLines,
): Promise<Array<ExtractedIngredient | null>> {
  const parsed = lines.map((line) => ({ line, item: parseIngredientLine(line) }));
  const out: ExtractedIngredient[] = parsed.map(({ line, item }) => {
    const product = item.label !== '' ? matchIngredient(catalog, '', item.label) : null;
    const exact = product !== null && isExactMatch(catalog, product, item.label);
    return {
      raw_text: line,
      name_en: exact ? product.name_en.toLowerCase() : '',
      quantity: item.quantity,
      unit: item.unit,
      is_guessed: false,
      is_optional: OPTIONAL_LINE.test(line),
      category: exact ? product.category : null,
    };
  });

  const pending = out.flatMap((ing, i) => (ing.name_en === '' ? [{ i, line: ing.raw_text }] : []));
  if (pending.length > 0) {
    const translations = await translate(pending);
    for (const { i } of pending) {
      const ing = out[i]!;
      const t = translations.get(i);
      if (t) {
        ing.name_en = t.name_en;
        ing.category = t.category;
        ing.is_optional = ing.is_optional || t.is_optional;
      } else {
        // No English name: trust the plain label match.
        const label = parsed[i]!.item.label;
        const product = label !== '' ? matchIngredient(catalog, '', label) : null;
        ing.name_en = (product?.name_en ?? label).toLowerCase();
        ing.category = product?.category ?? null;
      }
    }
  }
  return out.map((ing) => (ing.name_en !== '' && /\p{L}/u.test(ing.raw_text) ? ing : null));
}

/**
 * An import's JSON-LD ingredient lines: a heading line names the section of the lines under it (and a
 * line under "For serving:" is optional), the lines nothing names are left out, and if the model call
 * fails the local label stands in for name_en (the import goes on).
 */
export async function ingredientsFromLines(
  lines: readonly string[],
  catalog: Catalog,
  translate: TranslateLines,
  log: Logger,
): Promise<ExtractedIngredient[]> {
  const lenient: TranslateLines = async (pending) => {
    try {
      return await translate(pending);
    } catch (err) {
      if (isAbortError(err)) throw err;
      log.warn('translate_failed', { err, lines: pending.length });
      return new Map();
    }
  };
  const items = readSections(lines);
  const read = await readIngredientLines(items.map((x) => x.line), catalog, lenient);
  return withSections(
    read.flatMap((ing, i) => {
      const section = items[i]!.section;
      return ing ? [{ ...ing, section, is_optional: ing.is_optional || (section !== null && OPTIONAL_LINE.test(section)) }] : [];
    }),
  );
}
