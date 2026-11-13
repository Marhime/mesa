import type { Product } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { buildPantry, coverage, loadFullRecipe, loadRecipes, stapleProducts, type PantryRow } from '../src/kitchen-context';
import { keyWords, limitWords, recipeRefs, scaledAmount, servingsAsked, toAmount } from '../src/kitchen-text';
import { buildCatalog } from '../src/mapping';
import { fakeDb } from './fake-deps';

const row = (product_id: string, name_en: string, state: string, expires_on: string | null, more: Partial<PantryRow> = {}): PantryRow => ({
  product_id, name_en, state, expires_on, quantity: null, unit: null, level: null, ...more,
});

const product = (id: string, name_en: string, is_staple = false): Product => ({
  id, household_id: null, name_en, category: 'cupboard', default_zone: 'cupboard', shelf_life_days: null, is_staple, unit_family: 'mass',
});

describe('buildPantry', () => {
  const pantry = buildPantry(
    [
      row('milk', 'Milk', 'ok', '2026-11-20', { quantity: 500, unit: 'ml' }),
      row('milk', 'Milk', 'soon', '2026-11-07', { quantity: 1000, unit: 'ml' }),
      row('cream', 'Cream', 'check', '2026-11-04', { level: 'half' }),
      row('ham', 'Old ham', 'gone', '2026-10-01'),
      row('oil', 'Olive oil', 'out', null, { level: 'out' }),
    ],
    [
      { id: 'salt', name_en: 'Salt' },
      { id: 'oil', name_en: 'Olive oil' },
      { id: 'milk', name_en: 'Milk' },
    ],
  );

  it('keeps one line per food at home, soonest first, with its amount', () => {
    expect(pantry.foods).toEqual([
      { product_id: 'cream', name: 'Cream', state: 'check', expires_on: '2026-11-04', amount: 'half' },
      { product_id: 'milk', name: 'Milk', state: 'soon', expires_on: '2026-11-07', amount: '1.5 L' },
    ]);
  });

  it('follows pantry_has: a row at home, or a staple not marked out; gone rows are not at home', () => {
    expect(pantry.has('milk')).toBe(true);
    expect(pantry.has('salt')).toBe(true);
    expect(pantry.has('oil')).toBe(false);
    expect(pantry.has('ham')).toBe(false);
    expect(pantry.has(null)).toBe(false);
    expect(pantry.staples).toEqual(['Salt']);
    expect(pantry.food('salt')).toBeNull();
  });

  it('takes the household choice over the product default for staples', () => {
    const catalog = buildCatalog([product('salt', 'Salt', true), product('cumin', 'Cumin', true), product('rice', 'Rice')], []);
    const staples = stapleProducts(catalog, [
      { product_id: 'cumin', always_have: false },
      { product_id: 'rice', always_have: true },
    ]);
    expect(staples.map((s) => s.id).sort()).toEqual(['rice', 'salt']);
    expect(stapleProducts(null, [])).toEqual([]);
  });
});

describe('coverage', () => {
  it('counts needed ingredients at home and lists the foods going soon it uses', () => {
    const pantry = buildPantry([row('spinach', 'Spinach', 'soon', '2026-11-07'), row('rice', 'Rice', 'ok', null)], [{ id: 'salt', name_en: 'Salt' }]);
    const c = coverage(
      {
        ingredients: [
          { name: 'Spinach', product_id: 'spinach', is_optional: false },
          { name: 'Rice', product_id: 'rice', is_optional: false },
          { name: 'Salt', product_id: 'salt', is_optional: false },
          { name: 'Feta', product_id: 'feta', is_optional: false },
          { name: 'Chili', product_id: null, is_optional: true },
        ],
      },
      pantry,
    );
    expect(c.have).toBe(3);
    expect(c.total).toBe(4);
    expect(c.soon.map((f) => f.name)).toEqual(['Spinach']);
    expect(c.uses.map((f) => f.name)).toEqual(['Spinach', 'Rice']);
  });
});

describe('loadRecipes', () => {
  it('reads the household recipes with their ingredients in order', async () => {
    const { db, calls } = fakeDb(() => [
      {
        id: 'r1', title: 'Tinga', total_minutes: 30, servings: 4, is_favorite: false, last_cooked_at: null,
        recipe_ingredients: [
          { name: 'Tomato', product_id: 't', is_optional: false, position: 1 },
          { name: 'Chicken', product_id: 'c', is_optional: null, position: 0 },
        ],
      },
    ]);
    const recipes = await loadRecipes(db, 'h1');
    expect(recipes[0]!.ingredients.map((i) => i.name)).toEqual(['Chicken', 'Tomato']);
    expect(recipes[0]!.ingredients[0]!.is_optional).toBe(false);
    expect(recipes[0]!.source_author).toBeNull();
    expect(calls[0]!.filters).toContainEqual(['eq', 'household_id', 'h1']);
  });
});

describe('loadFullRecipe', () => {
  const id = '0b9a2f0e-2c1d-4c39-9d7e-1f3f5a7c9e11';

  it('reads one recipe of the household with its lines and steps in order', async () => {
    const { db, calls } = fakeDb(() => ({
      id, title: 'Tinga', servings: 4, total_minutes: null,
      recipe_ingredients: [
        { name: 'Tomato', raw_text: '3 jitomates', quantity: 3, unit: 'unit', product_id: 't', is_optional: false, position: 1 },
        { name: 'Chicken', raw_text: '500 g pollo', quantity: 500, unit: 'g', product_id: null, is_optional: null, position: 0 },
      ],
      recipe_steps: [{ text: 'Second', position: 1 }, { text: 'First', position: 0 }],
    }));
    const recipe = await loadFullRecipe(db, 'h1', id);
    expect(recipe).toEqual({
      id, title: 'Tinga', servings: 4, total_minutes: null,
      ingredients: [
        { name: 'Chicken', raw_text: '500 g pollo', quantity: 500, unit: 'g', product_id: null, is_optional: false },
        { name: 'Tomato', raw_text: '3 jitomates', quantity: 3, unit: 'unit', product_id: 't', is_optional: false },
      ],
      steps: ['First', 'Second'],
    });
    expect(calls[0]!.filters).toContainEqual(['eq', 'id', id]);
    expect(calls[0]!.filters).toContainEqual(['eq', 'household_id', 'h1']);
  });

  it('is null for a recipe of another household, and never asks for something that is not an id', async () => {
    expect(await loadFullRecipe(fakeDb(() => null).db, 'h1', id)).toBeNull();
    const { db, calls } = fakeDb(() => ({ id }));
    expect(await loadFullRecipe(db, 'h1', 'r1')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('servingsAsked', () => {
  it.each([
    ['for 2', { servings: 2, only: true }],
    ['For 2 people', { servings: 2, only: true }],
    ['pour 4 personnes ?', { servings: 4, only: true }],
    ['¿para 2?', { servings: 2, only: true }],
    ['para 2 personas', { servings: 2, only: true }],
    ['per 6 persone', { servings: 6, only: true }],
    ['2 servings', { servings: 2, only: true }],
    ['for 8 guests', { servings: 8, only: true }],
    ['6', { servings: 6, only: true }],
    ['Can I make it for 6?', { servings: 6, only: false }],
    ['Vegetarian, for 2', { servings: 2, only: false }],
    ['no cream?', null],
    ['cook it for 20 minutes less', null],
    ['can I keep it for 3 days?', null],
    ['how many calories per 10 g?', null],
    ['bake at 180°', null],
    ['for 120', null],
    ['for 0', null],
  ])('%s', (text, want) => {
    expect(servingsAsked(text)).toEqual(want);
  });

  it('scales amounts with scaleQuantity, rounded the way a cook reads them', () => {
    expect(scaledAmount({ quantity: 400, unit: 'g' }, 4, 2)).toEqual({ quantity: 200, unit: 'g' });
    expect(scaledAmount({ quantity: 1, unit: 'tbsp' }, 3, 2)).toEqual({ quantity: 0.67, unit: 'tbsp' });
    expect(scaledAmount({ quantity: null, unit: null }, 4, 2)).toEqual({ quantity: null, unit: null });
    expect(scaledAmount({ quantity: 3, unit: 'unit' }, 4, 4)).toEqual({ quantity: 3, unit: 'unit' });
  });
});

describe('kitchen text', () => {
  it('converts amounts to the app unit codes', () => {
    expect(toAmount(1.5, 'kg')).toEqual({ quantity: 1500, unit: 'g' });
    expect(toAmount(1, 'l')).toEqual({ quantity: 1000, unit: 'ml' });
    expect(toAmount(2, 'cucharadas')).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(toAmount(2, 'TBSP')).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(toAmount(3, null)).toEqual({ quantity: 3, unit: 'unit' });
    expect(toAmount(0.333333, 'cup')).toEqual({ quantity: 0.33, unit: 'cup' });
    expect(toAmount(0, 'g')).toEqual({ quantity: null, unit: null });
    expect(toAmount('2', 'g')).toEqual({ quantity: null, unit: null });
  });

  it('keeps an answer to its word limit, at a sentence end when it can', () => {
    const long = `${'word '.repeat(50).trim()}. ${'more '.repeat(50).trim()}`;
    expect(limitWords(long, 80).endsWith('word.')).toBe(true);
    expect(limitWords('one two three four', 3)).toBe('one two three…');
    expect(limitWords('short answer', 80)).toBe('short answer');
  });

  it('resolves short refs and known ids only', () => {
    const refs = recipeRefs(['id-a', 'id-b']);
    expect(refs.ref('id-b')).toBe('R2');
    expect([refs.resolve('R1'), refs.resolve(' r2 '), refs.resolve('2'), refs.resolve('id-a')]).toEqual(['id-a', 'id-b', 'id-b', 'id-a']);
    expect([refs.resolve('R3'), refs.resolve('id-x'), refs.resolve(7), refs.resolve(null)]).toEqual([null, null, null, null]);
  });

  it('matches words singular, without accents or filler', () => {
    expect([...keyWords('Easy Chicken Tacos with Jalapeños')]).toEqual(['chicken', 'taco', 'jalapeno']);
  });
});
