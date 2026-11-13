import { describe, expect, it } from 'vitest';
import { normalizeModelOutput, normalizeTranslations, parseModelJson, toQuantity } from '../src/model-output';

describe('normalizeModelOutput', () => {
  it('cleans messy model JSON into an ExtractedRecipe', () => {
    const raw = {
      not_a_recipe: 'false',
      title: '  Tacos   de canasta ',
      servings: '4 porciones',
      total_minutes: 'PT1H',
      language: 'es-MX',
      ingredients: [
        { raw_text: '1/2 kg de papa', name_en: 'Potato', quantity: '1/2', unit: 'kg', is_guessed: 'no', is_optional: 0, category: 'Vegetables' },
        { raw_text: '', name_en: '', quantity: null },
        '2 cdas de aceite',
        { raw_text: 'Sal', name_en: 'salt', quantity: 0, unit: '', is_guessed: true, category: 'spices', section: null },
        { raw_text: 'tortillas', name_en: 'corn tortilla', quantity: 20, is_guessed: 'true', category: 'BAKERY' },
        { raw_text: 'Queso fresco para servir', name_en: 'queso fresco', quantity: 'null', unit: 'null', is_optional: 'yes', category: 'dairy & eggs' },
        { raw_text: '100', name_en: '???', quantity: 100 },
        42,
      ],
      steps: ['1. Cuece las papas.', '', { text: 'Arma los tacos.' }, 'Paso 3: Sirve.\nDisfruta.'],
      image_shows_dish: 'true',
    };
    const out = normalizeModelOutput(raw);
    expect(out.kind).toBe('recipe');
    if (out.kind !== 'recipe') return;
    expect(out.imageShowsDish).toBe(true);
    expect(out.recipe).toEqual({
      title: 'Tacos de canasta',
      servings: 4,
      total_minutes: 60,
      language: 'es',
      steps: ['Cuece las papas.', 'Arma los tacos.', 'Sirve.', 'Disfruta.'],
      ingredients: [
        { raw_text: '1/2 kg de papa', name_en: 'potato', quantity: 0.5, unit: 'kg', is_guessed: false, is_optional: false, category: 'produce', section: null },
        { raw_text: '2 cdas de aceite', name_en: 'aceite', quantity: 2, unit: 'tbsp', is_guessed: false, is_optional: false, category: null, section: null },
        { raw_text: 'Sal', name_en: 'salt', quantity: null, unit: null, is_guessed: false, is_optional: false, category: 'cupboard', section: null },
        { raw_text: 'tortillas', name_en: 'corn tortilla', quantity: 20, unit: null, is_guessed: true, is_optional: false, category: 'bakery', section: null },
        { raw_text: 'Queso fresco para servir', name_en: 'queso fresco', quantity: null, unit: null, is_guessed: false, is_optional: true, category: 'dairy', section: null },
      ],
    });
  });

  it('recognizes "not a recipe" and wrapped answers', () => {
    expect(normalizeModelOutput({ not_a_recipe: true })).toEqual({ kind: 'not_recipe' });
    expect(normalizeModelOutput([{ not_a_recipe: 'true', title: '' }])).toEqual({ kind: 'not_recipe' });
    const wrapped = normalizeModelOutput({ recipe: { title: 'Agua de jamaica', ingredients: [{ raw_text: '1 taza de flor de jamaica', name_en: 'hibiscus flower', quantity: 1, unit: 'taza' }], steps: 'Hierve.\nCuela.' } });
    expect(wrapped.kind).toBe('recipe');
    if (wrapped.kind === 'recipe') {
      expect(wrapped.recipe.title).toBe('Agua de jamaica');
      expect(wrapped.recipe.servings).toBeNull();
      expect(wrapped.recipe.steps).toEqual(['Hierve.', 'Cuela.']);
      expect(wrapped.recipe.ingredients[0]).toMatchObject({ name_en: 'hibiscus flower', quantity: 1, unit: 'taza', is_guessed: false, category: null });
    }
  });

  it('rejects servings and times out of range', () => {
    const out = normalizeModelOutput({ not_a_recipe: false, title: 'X', servings: 200, total_minutes: -5, ingredients: [], steps: [] });
    expect(out.kind === 'recipe' && out.recipe.servings).toBeNull();
    expect(out.kind === 'recipe' && out.recipe.total_minutes).toBeNull();
  });

  it('throws on answers that are not objects', () => {
    expect(() => normalizeModelOutput('hello')).toThrow();
    expect(() => normalizeModelOutput(null)).toThrow();
  });
});

describe('parseModelJson', () => {
  it('accepts fenced JSON and text around it', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Here you go: {"a": 2} hope it helps')).toEqual({ a: 2 });
    expect(() => parseModelJson('')).toThrow();
    expect(() => parseModelJson('no json')).toThrow();
  });
});

describe('toQuantity', () => {
  it.each<[unknown, number | null]>([
    [2, 2],
    ['2', 2],
    ['1/2', 0.5],
    ['1 ½', 1.5],
    ['1,5', 1.5],
    ['2-3', 3],
    ['dos', 2],
    [0, null],
    [-1, null],
    ['al gusto', null],
    [Number.NaN, null],
  ])('%j → %j', (v, q) => {
    expect(toQuantity(v)).toBe(q);
  });
});

describe('normalizeTranslations', () => {
  it('keys translations by line index and skips bad items', () => {
    const map = normalizeTranslations({
      items: [
        { i: 0, name_en: 'Tomato', category: 'produce', is_optional: false },
        { i: '2', name_en: 'tostada', category: 'Bread', is_optional: 'true' },
        { i: 3, name_en: '', category: 'other' },
        { name_en: 'no index' },
      ],
    });
    expect([...map.keys()]).toEqual([0, 2]);
    expect(map.get(0)).toEqual({ name_en: 'tomato', category: 'produce', is_optional: false });
    expect(map.get(2)).toEqual({ name_en: 'tostada', category: 'bakery', is_optional: true });
  });
});
