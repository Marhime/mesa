// Matching free-text labels ("pechugas de pollo", "Huevos (12)") to catalog products.
import type { Product, ProductAlias } from './types';
import { isVaguePhrase } from './generic';
import { normalizeText, singularize } from './normalize';

export interface CatalogIndex {
  readonly size: number;
}

interface Entry {
  product: Product;
  household: boolean;
  order: number;
}

interface CatalogIndexData extends CatalogIndex {
  readonly phrases: ReadonlyMap<string, Entry[]>;
  readonly maxTokens: number;
}

/** Normalized whole words: "Pechuga de Pollo (500 g)" → ["pechuga", "de", "pollo", "500", "g"]. */
function words(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * Indexes every alias (and each product's name_en) by its word sequence, both as written and
 * singularized, so "jitomates" finds the "jitomate" alias and vice versa. A household product named
 * something vague ("Other", "Sauce") is left out with all its aliases, and so is a vague household alias
 * (see generic.ts): they would swallow every line that says the word.
 */
export function buildCatalogIndex(products: Product[], aliases: ProductAlias[]): CatalogIndex {
  const byId = new Map<string, Product>();
  for (const p of products) if (!isVaguePhrase(p, p.name_en)) byId.set(p.id, p);
  const phrases = new Map<string, Entry[]>();
  let maxTokens = 0;
  let order = 0;

  const addPhrase = (product: Product, phrase: string): void => {
    const raw = words(phrase);
    if (raw.length === 0 || isVaguePhrase(product, phrase)) return;
    maxTokens = Math.max(maxTokens, raw.length);
    const keys = new Set([raw.join(' '), raw.map((w) => singularize(w)).join(' ')]);
    for (const key of keys) {
      const list = phrases.get(key) ?? [];
      if (!list.some((e) => e.product.id === product.id)) {
        list.push({ product, household: product.household_id !== null, order: order++ });
      }
      phrases.set(key, list);
    }
  };

  for (const p of byId.values()) addPhrase(p, p.name_en);
  for (const a of aliases) {
    const p = byId.get(a.product_id);
    if (p) addPhrase(p, a.alias);
  }
  const index: CatalogIndexData = { size: byId.size, phrases, maxTokens };
  return index;
}

/**
 * The product whose alias is the longest whole-word sequence inside the label
 * ("pechuga de pollo" → Chicken breast, not Chicken). On equal length a household product beats a
 * global one, then the earlier position in the label. Null when nothing matches.
 */
export function matchProduct(index: CatalogIndex, label: string): Product | null {
  const data = index as CatalogIndexData;
  if (!(data.phrases instanceof Map) || data.maxTokens === 0) return null;
  const raw = words(label);
  if (raw.length === 0) return null;
  const sing = raw.map((w) => singularize(w));

  for (let len = Math.min(data.maxTokens, raw.length); len >= 1; len--) {
    let best: { entry: Entry; start: number; exact: boolean } | null = null;
    for (let start = 0; start + len <= raw.length; start++) {
      const exactKey = raw.slice(start, start + len).join(' ');
      const singKey = sing.slice(start, start + len).join(' ');
      const candidates: Array<[Entry, boolean]> = [];
      for (const e of data.phrases.get(exactKey) ?? []) candidates.push([e, true]);
      if (singKey !== exactKey) for (const e of data.phrases.get(singKey) ?? []) candidates.push([e, false]);
      for (const [entry, exact] of candidates) {
        if (best === null || better(entry, start, exact, best)) best = { entry, start, exact };
      }
    }
    if (best) return best.entry.product;
  }
  return null;
}

function better(entry: Entry, start: number, exact: boolean, cur: { entry: Entry; start: number; exact: boolean }): boolean {
  if (entry.household !== cur.entry.household) return entry.household;
  if (start !== cur.start) return start < cur.start;
  if (exact !== cur.exact) return exact;
  return entry.order < cur.entry.order;
}
