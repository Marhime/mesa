import type { Product } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { checkIdeas, homeFoods, homeMatcher, ideasSystemPrompt, ideasUserPrompt, type HomeFood } from '../src/ideas';
import { buildCatalog } from '../src/mapping';

const product = (id: string, name_en: string): Product => ({
  id,
  household_id: null,
  name_en,
  category: 'produce',
  default_zone: 'fridge',
  shelf_life_days: 7,
  is_staple: false,
  unit_family: 'count',
});

const catalog = buildCatalog(
  [product('tomato', 'Tomato'), product('spinach', 'Spinach'), product('egg', 'Egg'), product('rice', 'Rice')],
  [{ product_id: 'tomato', alias: 'jitomate', lang: 'es' }],
);

const home: HomeFood[] = [
  { product_id: 'egg', name_en: 'Egg', expires_on: '2026-11-20' },
  { product_id: 'rice', name_en: 'Rice', expires_on: null },
  { product_id: 'spinach', name_en: 'Spinach', expires_on: '2026-11-07' },
];

describe('homeFoods', () => {
  it('keeps one line per product (its soonest date), soonest first, undated last', () => {
    const rows = homeFoods([
      ...home,
      { product_id: 'egg', name_en: 'Egg', expires_on: '2026-11-08' },
      { product_id: 'x', name_en: '  ', expires_on: null },
    ]);
    expect(rows.map((r) => [r.name_en, r.expires_on])).toEqual([
      ['Spinach', '2026-11-07'],
      ['Egg', '2026-11-08'],
      ['Rice', null],
    ]);
  });
});

describe('homeMatcher', () => {
  const atHome = homeMatcher([{ product_id: 'tomato', name_en: 'Tomatoes' }, ...home], catalog);

  it('finds a food under its plural, case or accents, in the household words', () => {
    expect(atHome('eggs')).toBe('Egg');
    expect(atHome('  SPINACH ')).toBe('Spinach');
    expect(atHome('tomato')).toBe('Tomatoes');
  });

  it('goes through the catalog for another name of the same product, not for a different food', () => {
    expect(atHome('cherry tomatoes')).toBe('Tomatoes');
    expect(atHome('tomato paste')).toBeNull();
    expect(atHome('feta')).toBeNull();
    expect(atHome('')).toBeNull();
  });
});

describe('checkIdeas', () => {
  const atHome = homeMatcher(home, catalog);

  it('moves a "use" that is not at home to to_buy, and what is at home out of to_buy', () => {
    const out = checkIdeas(
      {
        ideas: [
          {
            title: ' Spinach  and tomato omelette ',
            uses: ['tomatoes', 'eggs', 'feta'],
            to_buy: ['spinach', 'chives', 'Chives'],
            minutes: 15.4,
            why: 'Uses the spinach before tomorrow.',
          },
        ],
      },
      'tomatoes',
      atHome,
    );
    expect(out).toEqual({
      food: 'tomatoes',
      ideas: [
        {
          title: 'Spinach and tomato omelette',
          uses: ['tomatoes', 'Egg', 'Spinach'],
          to_buy: ['feta', 'chives'],
          minutes: 15,
          why: 'Uses the spinach before tomorrow.',
        },
      ],
    });
  });

  it('always puts the food first, keeps three ideas at most, and drops untitled or repeated ones', () => {
    const idea = (title: string) => ({ title, uses: ['rice'], to_buy: [], minutes: null, why: '' });
    const out = checkIdeas(
      { ideas: [idea(''), idea('Fried rice'), idea('fried RICE'), idea('Tomato rice'), idea('Rice soup'), idea('Rice salad')] },
      'Tomato',
      atHome,
    );
    expect(out.ideas.map((i) => i.title)).toEqual(['Fried rice', 'Tomato rice', 'Rice soup']);
    expect(out.ideas[0]!.uses).toEqual(['Tomato', 'Rice']);
  });

  it('survives junk and odd numbers', () => {
    expect(checkIdeas(null, 'tomato', atHome).ideas).toEqual([]);
    expect(checkIdeas({ ideas: 'no' }, 'tomato', atHome).ideas).toEqual([]);
    const [a] = checkIdeas({ ideas: [{ title: 'Salsa', uses: 'tomato', to_buy: [3, 'onion'], minutes: -5 }] }, 'tomato', atHome).ideas;
    expect(a).toEqual({ title: 'Salsa', uses: ['tomato'], to_buy: ['onion'], minutes: null, why: '' });
  });
});

describe('ideas prompts', () => {
  it('lists foods soonest first with their date, and is not tied to one country', () => {
    const text = ideasUserPrompt('tomatoes', homeFoods(home), new Date('2026-11-06T12:00:00Z'));
    expect(text).toContain('Today is 2026-11-06 (Friday)');
    expect(text.indexOf('Spinach (use by 2026-11-07)')).toBeLessThan(text.indexOf('- Rice'));
    expect(ideasSystemPrompt()).not.toMatch(/Mexic/i);
    expect(ideasSystemPrompt()).toMatch(/Never write a recipe/);
  });
});
