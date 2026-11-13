import { describe, expect, it } from 'vitest';
import type { Category, ExtractedIngredient, Product, ProductAlias } from '@mesa/shared';
import { buildCatalog, matchIngredient, normalizeQuantity, planIngredients, resolveRows, zoneForCategory } from '../src/mapping';
import { ingredientsFromLines } from '../src/ingredient-lines';
import { log } from '../src/log';

const product = (id: string, name_en: string, category: Category, household_id: string | null = null): Product => ({
  id,
  household_id,
  name_en,
  category,
  default_zone: 'cupboard',
  shelf_life_days: null,
  is_staple: false,
  unit_family: 'count',
});

const products: Product[] = [
  product('p-tomato', 'Tomato', 'produce'),
  product('p-onion', 'Onion', 'produce'),
  product('p-chicken', 'Chicken', 'meat'),
  product('p-breast', 'Chicken breast', 'meat'),
  product('p-broth', 'Broth', 'cupboard'),
  product('p-salt', 'Salt', 'cupboard'),
  product('p-serrano', 'Serrano pepper', 'produce'),
  product('p-beef', 'Ground beef', 'meat'),
  product('p-garlic', 'Garlic', 'produce'),
  product('p-other-household', 'Achiote paste', 'cupboard', 'another-household'),
];
const aliases: ProductAlias[] = [
  ['p-tomato', 'tomato'], ['p-tomato', 'jitomate'], ['p-tomato', 'jitomates'],
  ['p-onion', 'onion'], ['p-onion', 'cebolla'], ['p-onion', 'white onion'],
  ['p-chicken', 'chicken'], ['p-chicken', 'pollo'],
  ['p-breast', 'chicken breast'], ['p-breast', 'pechuga de pollo'],
  ['p-broth', 'broth'], ['p-broth', 'caldo de pollo'], ['p-broth', 'caldo'],
  ['p-salt', 'salt'], ['p-salt', 'sal'],
  ['p-serrano', 'serrano pepper'], ['p-serrano', 'chile serrano'], ['p-serrano', 'serrano'],
  ['p-beef', 'ground beef'], ['p-beef', 'carne molida'],
  ['p-garlic', 'garlic'], ['p-garlic', 'ajo'], ['p-garlic', 'diente de ajo'],
].map(([product_id, alias]) => ({ product_id: product_id!, alias: alias!, lang: 'en' }));

// The worker gives each household the shared catalog plus its own products only.
const catalog = buildCatalog(products.filter((p) => p.household_id === null), aliases);

const ing = (raw_text: string, name_en: string, quantity: number | null, unit: string | null, extra: Partial<ExtractedIngredient> = {}): ExtractedIngredient => ({
  raw_text,
  name_en,
  quantity,
  unit,
  is_guessed: false,
  is_optional: false,
  category: null,
  ...extra,
});

describe('normalizeQuantity', () => {
  it.each<[number | null, string | null, number | null, string | null]>([
    [2, null, 2, 'unit'],
    [0.5, 'kg', 500, 'g'],
    [1, 'lb', 453.592, 'g'],
    [1.5, 'litros', 1500, 'ml'],
    [2, 'cdas', 2, 'tbsp'],
    [1, 'taza', 1, 'cup'],
    [3, 'dientes', 3, 'clove'],
    [1, 'lata', 1, 'can'],
    [500, 'g', 500, 'g'],
    [2, 'medium', 2, 'unit'],
    [2, 'grandes', 2, 'unit'],
    [3, 'ramitas', 3, null],
    [200, 'hojitas', null, null],
    [null, 'taza', null, null],
    [0, 'g', null, null],
  ])('%j %j → %j %j', (q, unit, quantity, stored) => {
    expect(normalizeQuantity(q, unit)).toEqual({ quantity, unit: stored });
  });
});

describe('matchIngredient', () => {
  const name = (nameEn: string, label: string): string | null => matchIngredient(catalog, nameEn, label)?.name_en ?? null;

  it('matches name_en first, then the raw label', () => {
    expect(name('tomato', 'Jitomates picados')).toBe('Tomato');
    expect(name('', 'Jitomates')).toBe('Tomato');
    expect(name('roma tomato', 'Jitomate saladet')).toBe('Tomato');
    expect(name('serrano chili', 'Chile serrano')).toBe('Serrano pepper');
    expect(name('boneless chicken breast', 'Pechuga de pollo sin hueso')).toBe('Chicken breast');
  });

  it('never trades the head noun for a partial match', () => {
    expect(name('chicken stock', 'Caldo de pollo')).toBe('Broth'); // label alias, not "Chicken"
    expect(name('tomato paste', 'Pasta de tomate')).toBeNull();
    expect(name('garlic powder', 'Ajo en polvo')).toBeNull();
    expect(name('garlic', 'Dientes de ajo')).toBe('Garlic');
    expect(name('chicken bouillon cube', 'Cubito de pollo')).toBeNull();
  });
});

describe('planIngredients', () => {
  const plan = planIngredients(
    [
      ing('2 jitomates', 'tomato', 2, null),
      ing('1/2 kg de pechuga de pollo', 'chicken breast', 0.5, 'kg'),
      ing('1 taza de caldo de pollo', 'chicken stock', 1, 'taza'),
      ing('1 cdita de pasta de achiote', 'achiote paste', 1, 'cdita', { category: 'cupboard' }),
      ing('Sal al gusto', 'salt', null, null),
      ing('2 medium onions', 'onion', 2, 'medium'),
      ing('3 ramitas de canela', 'cinnamon stick', 3, 'ramitas', { category: 'cupboard', is_guessed: true }),
      ing('Achiote extra para servir', 'achiote paste', null, null, { is_optional: true }),
      ing('1 bolsa de chícharos congelados', 'frozen peas', 1, 'bolsa', { category: 'frozen' }),
      ing('1 lb ground beef', 'ground beef', 1, 'lb'),
      ing('Queso fresco', 'queso fresco', null, null, { category: 'dairy' }),
    ],
    catalog,
  );
  const rows = plan.ingredients.map((p) => p.row);

  it('maps matched ingredients to catalog products with normalized quantities', () => {
    expect(rows[0]).toEqual({ position: 0, raw_text: '2 jitomates', name: 'Tomato', product_id: 'p-tomato', quantity: 2, unit: 'unit', is_guessed: false, is_optional: false, section: null });
    expect(rows[1]).toMatchObject({ name: 'Chicken breast', product_id: 'p-breast', quantity: 500, unit: 'g' });
    // The recipe keeps its own words; Broth is only the link.
    expect(rows[2]).toMatchObject({ name: 'Chicken stock', product_id: 'p-broth', quantity: 1, unit: 'cup' });
    expect(rows[4]).toMatchObject({ name: 'Salt', product_id: 'p-salt', quantity: null, unit: null });
    expect(rows[5]).toMatchObject({ name: 'Onion', product_id: 'p-onion', quantity: 2, unit: 'unit' });
    expect(rows[9]).toMatchObject({ name: 'Ground beef', product_id: 'p-beef', quantity: 453.592, unit: 'g' });
  });

  it('plans one household product per unknown name, never another household’s', () => {
    expect(plan.newProducts.map((p) => p.name_en)).toEqual(['Achiote paste', 'Cinnamon stick', 'Frozen peas', 'Queso fresco']);
    const achiote = plan.newProducts[0]!;
    expect(achiote).toEqual({
      key: 'achiote paste',
      name_en: 'Achiote paste',
      category: 'cupboard',
      default_zone: 'cupboard',
      unit_family: 'volume',
      aliases: ['achiote paste', 'pasta de achiote', 'achiote extra'],
    });
    expect(plan.ingredients[3]!.newProductKey).toBe('achiote paste');
    expect(plan.ingredients[7]!.newProductKey).toBe('achiote paste');
    expect(rows[7]).toMatchObject({ is_optional: true, quantity: null, product_id: null });
    expect(plan.newProducts[2]).toMatchObject({ category: 'frozen', default_zone: 'freezer', unit_family: 'count' });
    expect(plan.newProducts[3]).toMatchObject({ category: 'dairy', default_zone: 'fridge', unit_family: 'other' });
  });

  it('keeps small counts with unknown units and the guessed flag', () => {
    expect(rows[6]).toMatchObject({ name: 'Cinnamon stick', quantity: 3, unit: null, is_guessed: true });
  });

  it('fills product ids from created products and positions stay in order', () => {
    const created = new Map([
      ['achiote paste', product('h-achiote', 'Achiote paste', 'cupboard', 'h1')],
      ['frozen peas', product('h-peas', 'Frozen peas', 'frozen', 'h1')],
    ]);
    const resolved = resolveRows(plan, created);
    expect(resolved.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(resolved[3]).toMatchObject({ product_id: 'h-achiote', name: 'Achiote paste' });
    expect(resolved[7]).toMatchObject({ product_id: 'h-achiote' });
    expect(resolved[8]).toMatchObject({ product_id: 'h-peas', quantity: 1, unit: 'pack' });
    expect(resolved[6]).toMatchObject({ product_id: null, name: 'Cinnamon stick' }); // creation failed → no product
  });

  it('zones follow the category', () => {
    expect(zoneForCategory('produce')).toBe('fridge');
    expect(zoneForCategory('meat')).toBe('fridge');
    expect(zoneForCategory('dairy')).toBe('fridge');
    expect(zoneForCategory('frozen')).toBe('freezer');
    expect(zoneForCategory('bakery')).toBe('cupboard');
    expect(zoneForCategory('other')).toBe('cupboard');
  });
});

describe('ingredientsFromLines (JSON-LD path)', () => {
  it('skips the model when every label is a catalog product', async () => {
    let calls = 0;
    const out = await ingredientsFromLines(['3 jitomates', '1 cebolla', 'Sal al gusto'], catalog, async () => {
      calls++;
      return new Map();
    }, log);
    expect(calls).toBe(0);
    expect(out.map((i) => [i.name_en, i.quantity, i.unit, i.category])).toEqual([
      ['tomato', 3, 'unit', 'produce'],
      ['onion', 1, 'unit', 'produce'],
      ['salt', null, null, 'cupboard'],
    ]);
  });

  it('translates only the lines that did not match exactly, in one batch', async () => {
    const seen: Array<Array<{ i: number; line: string }>> = [];
    const out = await ingredientsFromLines(
      ['2 jitomates', '1 cdita de pasta de achiote', 'Tostadas (opcional)', '1/2 cebolla blanca, fileteada'],
      catalog,
      async (pending) => {
        seen.push(pending);
        return new Map([
          [1, { name_en: 'achiote paste', category: 'cupboard' as const, is_optional: false }],
          [2, { name_en: 'tostada', category: 'bakery' as const, is_optional: false }],
        ]);
      },
      log,
    );
    expect(seen).toEqual([[{ i: 1, line: '1 cdita de pasta de achiote' }, { i: 2, line: 'Tostadas (opcional)' }, { i: 3, line: '1/2 cebolla blanca, fileteada' }]]);
    expect(out[1]).toMatchObject({ name_en: 'achiote paste', quantity: 1, unit: 'tsp', category: 'cupboard' });
    expect(out[2]).toMatchObject({ name_en: 'tostada', is_optional: true, category: 'bakery' });
    // no translation came back for line 3: the plain label match ("cebolla" → Onion) stands in
    expect(out[3]).toMatchObject({ name_en: 'onion', quantity: 0.5, unit: 'unit', category: 'produce' });
  });

  it('survives a failed translation call', async () => {
    const out = await ingredientsFromLines(['1 taza de flor de jamaica'], catalog, async () => {
      throw new Error('503');
    }, log);
    expect(out).toEqual([{ raw_text: '1 taza de flor de jamaica', name_en: 'flor de jamaica', quantity: 1, unit: 'cup', is_guessed: false, is_optional: false, category: null, section: null }]);
  });
});
