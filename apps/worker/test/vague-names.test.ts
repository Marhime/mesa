// Vague names ("Other", "Sauce") never become, match or get offered as products; a head noun whose
// qualifier is the product (sauce, oil, paste…) never trades that qualifier away. Real catalog, plus the
// two household products a past import made ("Other" swallowed star anise, "Sauce" fish sauce).
import { readFileSync } from 'node:fs';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, ExtractedIngredient, Product, ProductAlias } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { CatalogStore, memoryCatalogReader } from '../src/catalog-store';
import { knownNames } from '../src/known-names';
import { log } from '../src/log';
import { buildCatalog, matchIngredient, planIngredients, specificName } from '../src/mapping';
import { recipeSystemPrompt, translationSystemPrompt } from '../src/prompts';
import { receiptLines, sweepLines } from '../src/scan';
import { normalizeReceipt, normalizeSweep } from '../src/scan-output';
import { receiptSystemPrompt, sweepSystemPrompt } from '../src/scan-prompts';
import { normalizeTidy } from '../src/tidy';

interface CatalogEntry {
  name_en: string;
  category: Category;
  aliases: Record<string, string[]>;
}
const entries = JSON.parse(readFileSync(new URL('../../../packages/shared/catalog/catalog.json', import.meta.url), 'utf8')) as CatalogEntry[];

const product = (id: string, name_en: string, category: Category, household_id: string | null = null): Product => ({
  id, household_id, name_en, category, default_zone: 'cupboard', shelf_life_days: null, is_staple: false, unit_family: 'count',
});
const H = 'h1';
const shared: Product[] = entries.map((e) => product(e.name_en, e.name_en, e.category));
const sharedAliases: ProductAlias[] = entries.flatMap((e) =>
  Object.entries(e.aliases).flatMap(([lang, list]) => list.map((alias) => ({ product_id: e.name_en, alias, lang }))),
);
const household: Product[] = [
  product('h-other', 'Other', 'other', H),
  product('h-sauce', 'Sauce', 'cupboard', H),
  product('h-achiote', 'Achiote paste', 'cupboard', H),
];
const householdAliases: ProductAlias[] = [
  ['h-other', 'other'], ['h-other', 'bo kho seasoning'], ['h-other', 'minced lemongrass'], ['h-other', 'star anise'],
  ['h-sauce', 'sauce'], ['h-sauce', 'fish sauce'],
  ['h-achiote', 'achiote paste'], ['h-achiote', 'paste'],
].map(([product_id, alias]) => ({ product_id: product_id!, alias: alias!, lang: 'en' }));

const catalog = buildCatalog([...shared, ...household], [...sharedAliases, ...householdAliases]);
const match = (nameEn: string, label = ''): string | null => matchIngredient(catalog, nameEn, label)?.name_en ?? null;

describe('vague household products', () => {
  it('are left out of the catalog with the lines they swallowed', () => {
    const names = catalog.products.map((p) => p.name_en);
    expect(names).not.toContain('Other');
    expect(names).not.toContain('Sauce');
    expect(names).toContain('Achiote paste');
    expect(match('star anise', 'Star anise')).toBeNull();
    expect(match('other', 'Bò Kho seasoning')).toBeNull();
    expect(match('', 'Minced lemongrass')).toBeNull();
    // a vague alias of a real household product is dropped too: "paste" is not Achiote paste
    expect(match('curry paste', 'Curry paste')).toBeNull();
    expect(match('achiote paste')).toBe('Achiote paste');
  });

  it('are never offered to the model as known names', async () => {
    const store = new CatalogStore(memoryCatalogReader([...shared.slice(0, 3), ...household]), log);
    const known = knownNames(await store.forHousehold(H));
    expect(known).toContain('Achiote paste');
    expect(known).not.toContain('Other');
    expect(known).not.toContain('Sauce');
  });

  it('no curated catalog name is vague', () => {
    expect(buildCatalog(shared, sharedAliases).products).toHaveLength(shared.length);
  });
});

describe('qualified heads keep their qualifier', () => {
  it('fish sauce is neither Sauce nor Soy sauce; soy sauce variants stay Soy sauce', () => {
    expect(match('fish sauce', 'Fish sauce')).toBeNull();
    expect(match('soy sauce', 'Soy sauce')).toBe('Soy sauce');
    expect(match('light soy sauce')).toBe('Soy sauce');
    expect(match('low sodium soy sauce')).toBe('Soy sauce');
    expect(match('hot sauce')).toBe('Hot sauce');
    expect(match('sweet chili sauce')).toBeNull();
  });

  it('dark soy sauce is its own bottle, not Soy sauce', () => {
    expect(match('dark soy sauce')).toBeNull();
  });

  it('oils, vinegars and powders match only themselves', () => {
    expect(match('vegetable oil')).toBe('Cooking oil');
    expect(match('oil')).toBe('Cooking oil');
    expect(match('neutral oil')).toBe('Cooking oil');
    expect(match('light olive oil')).toBe('Olive oil');
    expect(match('sesame oil')).toBeNull();
    expect(match('annatto oil', 'Annatto oil')).toBeNull();
    expect(match('balsamic vinegar')).toBeNull();
    expect(match('distilled white vinegar')).toBe('Vinegar');
    expect(match('onion powder', 'Onion powder')).toBeNull();
    expect(match('ancho chili powder')).toBeNull();
    expect(match('tomato paste')).toBe('Tomato puree');
  });

  it('other heads still take a partial match', () => {
    expect(match('white onion')).toBe('Onion');
    expect(match('sweet onion')).toBe('Onion');
    expect(match('beef broth')).toBe('Broth');
    expect(match('bay leaf', 'Bay leaves')).toBe('Bay leaf');
  });
});

const ing = (raw_text: string, name_en: string, quantity: number | null, unit: string | null, category: Category | null = null): ExtractedIngredient => ({
  raw_text, name_en, quantity, unit, is_guessed: false, is_optional: false, category,
});

describe('a linked line keeps its own words (Beef and onion: soy sauce and dark soy sauce)', () => {
  const rows = planIngredients(
    [
      ing('1 tsp soy sauce', 'soy sauce', 1, 'tsp', 'cupboard'),
      ing('1 tsp dark soy sauce', 'dark soy sauce', 1, 'tsp', 'cupboard'),
      ing('1 tsp light soy sauce', 'light soy sauce', 1, 'tsp', 'cupboard'),
      ing('1 white onion', 'white onion', 1, null, 'produce'),
    ],
    catalog,
  ).ingredients.map((p) => p.row);

  it('shows what the recipe says, linked to the product it is', () => {
    expect(rows.map((r) => r.name)).toEqual(['Soy sauce', 'Dark soy sauce', 'Light soy sauce', 'White onion']);
    expect(rows[0]).toMatchObject({ product_id: 'Soy sauce' });
    expect(rows[1]?.product_id).not.toBe('Soy sauce');
    expect(rows[2]).toMatchObject({ product_id: 'Soy sauce' });
    expect(rows[3]).toMatchObject({ product_id: 'Onion' });
  });
});

describe('planIngredients with vague names (the Bò Kho import)', () => {
  const plan = planIngredients(
    [
      ing('2 tbsp fish sauce', 'sauce', 2, 'tbsp', 'cupboard'),
      ing('2 tbsp soy sauce', 'soy sauce', 2, 'tbsp', 'cupboard'),
      ing('1.5 tbsp Bò Kho seasoning', 'other', 1.5, 'tbsp', 'cupboard'),
      ing('2 tbsp minced lemongrass', 'other', 2, 'tbsp', 'produce'),
      ing('2–3 star anise', 'star anise', 3, null, 'cupboard'),
      ing('1 thumb ginger, sliced', 'ginger', 1, 'thumb', 'produce'),
      ing('2 tbsp annatto oil (or regular oil)', 'annatto oil', 2, 'tbsp', 'cupboard'),
      ing('2 tbsp sauce', 'sauce', 2, 'tbsp', 'cupboard'),
    ],
    catalog,
  );
  const rows = plan.ingredients.map((p) => p.row);

  it('names each line after what it says, never "Other" or "Sauce"', () => {
    expect(rows.map((r) => r.name)).toEqual([
      'Fish sauce', 'Soy sauce', 'Bò Kho seasoning', 'Minced lemongrass', 'Star anise', 'Ginger', 'Annatto oil', 'Sauce',
    ]);
    expect(rows[1]).toMatchObject({ product_id: 'Soy sauce' });
  });

  it('creates specific products only; a line that says just "sauce" stays a plain line', () => {
    expect(plan.newProducts.map((p) => p.name_en)).toEqual(['Fish sauce', 'Bò Kho seasoning', 'Minced lemongrass', 'Star anise', 'Ginger', 'Annatto oil']);
    expect(plan.newProducts.flatMap((p) => p.aliases)).not.toContain('sauce');
    expect(rows[7]).toMatchObject({ name: 'Sauce', product_id: null });
    expect(plan.ingredients[7]!.newProductKey).toBeNull();
  });

  it('picks the first specific name', () => {
    expect(specificName('other', 'Star anise')).toBe('Star anise');
    expect(specificName('sauce', 'Sauce')).toBe('sauce');
    expect(specificName('lemongrass', 'Minced lemongrass')).toBe('lemongrass');
    expect(specificName('', 'Fish sauce')).toBe('Fish sauce');
  });
});

describe('scans never propose a vague product', () => {
  it('a receipt line names what was printed, and drops a line that names nothing', () => {
    const receipt = normalizeReceipt({
      is_receipt: true,
      lines: [
        { raw: 'SALSA DE PESCADO 200ML', name_en: 'sauce', category: 'cupboard', quantity: 1, confidence: 0.7 },
        { raw: 'MISC 3.50', name_en: 'other', category: 'other', quantity: 1, confidence: 0.4 },
        { raw: 'SALSA SOYA', name_en: 'soy sauce', category: 'cupboard', quantity: 1, confidence: 0.9 },
      ],
    });
    const { lines } = receiptLines(receipt, [], catalog);
    expect(lines.map((l) => [l.label, l.product_id])).toEqual([
      ['Salsa de pescado', null],
      ['Soy sauce', 'Soy sauce'],
    ]);
  });

  it('a sweep item keeps its own label over a vague name_en', () => {
    const items = normalizeSweep({
      items: [
        { name_en: 'sauce', label: 'Nước mắm', category: 'cupboard', level: 'half', confidence: 0.8 },
        { name_en: 'other', label: 'stuff', category: 'other', level: 'full', confidence: 0.4 },
      ],
    });
    const { lines } = sweepLines(items, 'cupboard', [], catalog);
    expect(lines.map((l) => l.label)).toEqual(['Nước mắm']);
  });
});

describe('the model is told not to go vague', () => {
  it('every prompt that asks for name_en says so, and none offers the vague products', () => {
    const known = catalog.products.map((p) => p.name_en);
    for (const prompt of [recipeSystemPrompt(known), translationSystemPrompt(known), sweepSystemPrompt('fridge', known, []), receiptSystemPrompt(known, [])]) {
      expect(prompt).toContain('"fish sauce", never "sauce"');
      expect(prompt).toContain('only when it is the same product');
      expect(prompt).not.toContain('copy that name exactly');
      const offered = /Known products: (.*)\.$/.exec(prompt)?.[1]?.split(', ') ?? [];
      expect(offered).toContain('achiote paste');
      expect(offered).not.toContain('other');
      expect(offered).not.toContain('sauce');
    }
  });

  it('tidy keeps no vague alias', () => {
    const out = normalizeTidy({
      items: [{
        name: 'Fish sauce', category: 'cupboard', family: 'cans_sauces', picto: 'sauce', default_zone: 'cupboard',
        shelf_life_days: null, unit_family: 'volume', same_as: null,
        aliases: [{ lang: 'es', name: 'salsa de pescado' }, { lang: 'en', name: 'sauce' }, { lang: 'fr', name: 'Sauces' }],
      }],
    });
    expect(out.get('fish sauce')?.aliases).toEqual([{ lang: 'es', name: 'salsa de pescado' }]);
  });
});
