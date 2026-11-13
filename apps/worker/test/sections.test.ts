// Ingredient sections at import: the model's sections and a website's heading lines become each line's
// section, kept only for a recipe with two or more, one spelling each, the lines in the order the editor
// can write back; every line stays, even one product in three sections.
import type { Category, ExtractedIngredient, Product } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { ingredientsFromLines } from '../src/ingredient-lines';
import { withSections } from '../src/ingredient-sections';
import { buildCatalog, planIngredients } from '../src/mapping';
import { normalizeModelOutput, RECIPE_RESPONSE_SCHEMA } from '../src/model-output';
import { recipeSystemPrompt } from '../src/prompts';
import { silent } from './fake-deps';

const product = (id: string, name_en: string, category: Category): Product => ({
  id, household_id: null, name_en, category, default_zone: 'cupboard', shelf_life_days: null, is_staple: false, unit_family: 'count',
});
const catalog = buildCatalog([product('p-beef', 'Beef', 'meat'), product('p-noodles', 'Egg noodles', 'cupboard')], [
  { product_id: 'p-beef', alias: 'beef', lang: 'en' },
  { product_id: 'p-noodles', alias: 'egg noodles', lang: 'en' },
]);

const line = (raw_text: string, name_en: string, section: string | null): ExtractedIngredient => ({
  raw_text, name_en, quantity: null, unit: null, is_guessed: false, is_optional: false, category: 'cupboard', section,
});

describe('the model is asked for sections', () => {
  it('in the schema and in the rules, every line kept', () => {
    const ingredient = RECIPE_RESPONSE_SCHEMA.properties!.ingredients!.items!;
    expect(ingredient.properties!.section).toMatchObject({ type: 'string', nullable: true });
    expect(ingredient.required).toContain('section');
    const prompt = recipeSystemPrompt([]);
    expect(prompt).toMatch(/section: the part of the recipe it belongs to, as the recipe names it/);
    expect(prompt).toMatch(/give every ingredient its section/);
    expect(prompt).toMatch(/Keep every line, even when an ingredient appears in several sections/);
  });
});

describe('a stir-fry with dark soy sauce in three sections', () => {
  const answer = {
    not_a_recipe: false, title: 'Beef chow mein', servings: 2, total_minutes: 30, language: 'en', steps: ['Mix.'],
    ingredients: [
      line('200 g beef', 'beef', 'For the beef marinade:'),
      line('1 tsp dark soy sauce', 'dark soy sauce', ' Marinade '),
      line('2 tbsp dark soy sauce', 'dark soy sauce', 'Sauce'),
      line('1 tsp sugar', 'sugar', 'sauce'),
      line('200 g egg noodles', 'egg noodles', 'Noodles'),
      line('1 tbsp dark soy sauce', 'dark soy sauce', 'Noodles'),
      line('2 spring onions', 'spring onion', 'null'),
    ],
  };

  it('keeps every line with its section, one spelling each, unsectioned lines first', () => {
    const out = normalizeModelOutput(answer);
    if (out.kind !== 'recipe') throw new Error('not a recipe');
    expect(out.recipe.ingredients.map((i) => [i.raw_text, i.section])).toEqual([
      ['2 spring onions', null],
      ['200 g beef', 'For the beef marinade'],
      ['1 tsp dark soy sauce', 'Marinade'],
      ['2 tbsp dark soy sauce', 'Sauce'],
      ['1 tsp sugar', 'Sauce'],
      ['200 g egg noodles', 'Noodles'],
      ['1 tbsp dark soy sauce', 'Noodles'],
    ]);
  });

  it('makes one product for the three lines, each line positioned and in its section', () => {
    const out = normalizeModelOutput(answer);
    if (out.kind !== 'recipe') throw new Error('not a recipe');
    const plan = planIngredients(out.recipe.ingredients, catalog);
    expect(plan.newProducts.filter((p) => p.name_en === 'Dark soy sauce')).toHaveLength(1);
    const soy = plan.ingredients.filter((p) => p.newProductKey === 'dark soy sauce').map((p) => [p.row.position, p.row.section]);
    expect(soy).toEqual([[2, 'Marinade'], [3, 'Sauce'], [6, 'Noodles']]);
  });
});

describe('withSections', () => {
  it('drops a single section name: it says nothing', () => {
    expect(withSections([line('a', 'a', 'Ingredients'), line('b', 'b', 'ingredients'), line('c', 'c', null)]).map((i) => i.section)).toEqual([null, null, null]);
  });
});

describe('a website whose lines have headings', () => {
  it('reads them as the sections of the lines under them, and "To serve:" as optional', async () => {
    const lines = ['For the beef:', '200 g beef', 'For the noodles:', '200 g egg noodles', 'To serve:', '1 lime'];
    const out = await ingredientsFromLines(lines, catalog, async (pending) => new Map(pending.map(({ i }) => [i, { name_en: 'lime', category: 'produce' as const, is_optional: false }])), silent);
    expect(out.map((i) => [i.raw_text, i.section, i.is_optional])).toEqual([
      ['200 g beef', 'For the beef', false],
      ['200 g egg noodles', 'For the noodles', false],
      ['1 lime', 'To serve', true],
    ]);
  });

  it('gives lines before the first heading no section, first in the recipe', async () => {
    const lines = ['200 g beef', 'Sauce:', '1 tbsp dark soy sauce', 'Noodles:', '200 g egg noodles'];
    const out = await ingredientsFromLines(lines, catalog, async () => new Map(), silent);
    expect(out.map((i) => [i.raw_text, i.section])).toEqual([
      ['200 g beef', null],
      ['1 tbsp dark soy sauce', 'Sauce'],
      ['200 g egg noodles', 'Noodles'],
    ]);
  });
});
