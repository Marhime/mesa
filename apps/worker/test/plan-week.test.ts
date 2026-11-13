import type { ImportJob, Product } from '@mesa/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGES } from '../src/errors';
import { processJob } from '../src/runner';
import { buildPantry, type KitchenRecipe, type PantryRow } from '../src/kitchen-context';
import { recipeRefs } from '../src/kitchen-text';
import { buildCatalog } from '../src/mapping';
import { checkPlan, planUserPrompt, planWishes, PLAN_WEIGHTS, scoreRecipe, shortlist } from '../src/plan-week';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

const today = new Date('2026-11-06T12:00:00Z');
const daysAgo = (n: number, from = today) => new Date(from.getTime() - n * 86_400_000).toISOString();

const row = (product_id: string, name_en: string, state: string, expires_on: string | null): PantryRow => ({
  product_id, name_en, state, expires_on, quantity: null, unit: null, level: null,
});
const pantryRows = [
  row('spinach', 'Spinach', 'soon', '2026-11-07'),
  row('cream', 'Cream', 'check', '2026-11-05'),
  row('rice', 'Rice', 'ok', null),
  row('chicken', 'Chicken', 'ok', '2026-11-20'),
];
const pantry = buildPantry(pantryRows, [{ id: 'salt', name_en: 'Salt' }]);

let n = 0;
const recipe = (title: string, products: string[], over: Partial<KitchenRecipe> = {}): KitchenRecipe => ({
  id: over.id ?? `r${++n}`,
  title,
  total_minutes: 30,
  servings: 4,
  is_favorite: false,
  last_cooked_at: null,
  source_author: null,
  ingredients: products.map((p) => ({ name: p, product_id: p, is_optional: false })),
  ...over,
});

describe('scoreRecipe', () => {
  const score = (r: KitchenRecipe, wishes: string[] = []) => scoreRecipe(r, shortlist([r], pantry, { today, wishes: null })[0]!.cover, today, new Set(wishes));

  it('weighs foods going soon, the share at home and favorites, and holds back what was cooked this week', () => {
    const usesSoon = recipe('Creamy spinach', ['spinach', 'cream', 'feta']);
    const allAtHome = recipe('Rice', ['rice', 'salt']);
    const favorite = recipe('Lasagna', ['pasta', 'beef'], { is_favorite: true });
    const recent = recipe('Creamy spinach again', ['spinach', 'cream', 'feta'], { last_cooked_at: daysAgo(2) });
    const older = recipe('Creamy spinach once', ['spinach', 'cream', 'feta'], { last_cooked_at: daysAgo(9) });

    expect(score(usesSoon)).toBeCloseTo(2 * PLAN_WEIGHTS.soon + PLAN_WEIGHTS.atHome * (2 / 3), 2);
    expect(score(allAtHome)).toBe(PLAN_WEIGHTS.atHome);
    expect(score(favorite)).toBe(PLAN_WEIGHTS.favorite);
    expect(score(recent)).toBeCloseTo(score(usesSoon) + PLAN_WEIGHTS.recent, 2);
    expect(score(older)).toBe(score(usesSoon));
  });

  it('lifts recipes that share words with the wishes', () => {
    const fish = recipe('Fish tacos', ['fish', 'tortilla']);
    expect(score(fish, ['fish'])).toBe(PLAN_WEIGHTS.wish);
  });
});

describe('shortlist', () => {
  it('leaves out the menu, keeps to its size and spreads similar titles', () => {
    const recipes = [
      recipe('Chicken curry', ['chicken', 'rice'], { id: 'curry' }),
      recipe('Chicken soup', ['chicken', 'rice'], { id: 'soup' }),
      recipe('Chicken salad', ['chicken', 'rice'], { id: 'salad' }),
      recipe('Lentil stew', ['rice', 'salt'], { id: 'lentil' }),
      recipe('Chicken tinga', ['chicken', 'rice', 'spinach'], { id: 'tinga' }),
    ];
    const list = shortlist(recipes, pantry, { today, wishes: null, skip: new Set(['tinga']), size: 3 });
    expect(list.map((c) => c.recipe.id)).toEqual(['curry', 'lentil', 'salad']);
  });

  it('is empty without recipes, and plans from all of them when told nothing to skip', () => {
    expect(shortlist([], pantry, { today, wishes: null })).toEqual([]);
    expect(shortlist([recipe('A', [])], pantry, { today, wishes: null })).toHaveLength(1);
  });
});

describe('planWishes', () => {
  it("is null for 'week' or nothing", () => {
    expect(planWishes('week')).toBeNull();
    expect(planWishes(' Week ')).toBeNull();
    expect(planWishes(null)).toBeNull();
    expect(planWishes('  Quick on weekdays,   vegetarian ')).toBe('Quick on weekdays, vegetarian');
  });
});

describe('checkPlan', () => {
  const recipes = [
    recipe('Creamy spinach pasta', ['spinach', 'cream', 'pasta'], { id: 'pasta' }),
    recipe('Chicken and rice', ['chicken', 'rice', 'salt'], { id: 'chicken-rice' }),
    recipe('Lentil soup', ['lentil'], { id: 'lentil' }),
  ];
  const candidates = shortlist(recipes, pantry, { today, wishes: null });
  const refs = recipeRefs(candidates.map((c) => c.recipe.id));
  const refOf = (id: string) => refs.ref(id);
  const catalog = buildCatalog([{ id: 'chicken', household_id: null, name_en: 'Chicken', category: 'meat', default_zone: 'fridge', shelf_life_days: 3, is_staple: false, unit_family: 'mass' } as Product], [
    { product_id: 'chicken', alias: 'pollo', lang: 'es' },
  ]);

  it('keeps shortlisted recipes once, by ref or id, with their own titles; unknown ones are dropped', () => {
    const plan = checkPlan(
      {
        dinners: [
          { recipe: refOf('pasta'), day: 'Monday', why: 'Uses the spinach before tomorrow.', uses_soon: [] },
          { recipe: 'R99', day: 'Tuesday', why: 'Invented', uses_soon: [] },
          { recipe: 'made-up-uuid', day: null, why: 'Invented', uses_soon: [] },
          { recipe: refOf('pasta'), day: 'Wednesday', why: 'Again', uses_soon: [] },
          { recipe: 'chicken-rice', day: 'monday', why: '', uses_soon: ['pollo', 'Spinach', 'Rice'] },
          { recipe: refOf('lentil'), day: 'Someday', why: 'Something warm', uses_soon: [] },
        ],
        note: '  Uses the cream and spinach early. ',
      },
      { wishes: null, refs, candidates, catalog },
    );
    expect(plan).toEqual({
      wishes: null,
      dinners: [
        { recipe_id: 'pasta', title: 'Creamy spinach pasta', day: 'Monday', why: 'Uses the spinach before tomorrow.', uses_soon: ['Cream', 'Spinach'] },
        // Same day twice: the second loses it. No reason given: what the list shows (salt is a staple).
        // Spinach isn't in it.
        { recipe_id: 'chicken-rice', title: 'Chicken and rice', day: null, why: '3 of 3 ingredients at home', uses_soon: ['Chicken', 'Rice'] },
        { recipe_id: 'lentil', title: 'Lentil soup', day: null, why: 'Something warm', uses_soon: [] },
      ],
      note: 'Uses the cream and spinach early.',
    });
  });

  it('answers no dinner for an empty or broken answer', () => {
    expect(checkPlan(null, { wishes: 'x', refs, candidates, catalog: null })).toEqual({ wishes: 'x', dinners: [], note: null });
    expect(checkPlan({ dinners: 'nope' }, { wishes: null, refs, candidates, catalog: null }).dinners).toEqual([]);
  });

  it('lists the shortlist with refs, what goes soon and the menu in the prompt', () => {
    const prompt = planUserPrompt({ today, wishes: null, candidates, refs, pantry, menu: ['Tacos'] });
    expect(prompt).toContain('Today is 2026-11-06 (Friday).');
    expect(prompt).toContain('Wishes: none');
    expect(prompt).toContain('Already on the menu: Tacos');
    expect(prompt).toContain(`${refOf('pasta')} | Creamy spinach pasta | 30 min | never cooked | at home 2/3 | goes soon: Cream, Spinach`);
    expect(prompt.indexOf('- Cream')).toBeLessThan(prompt.indexOf('- Spinach'));
  });
});

describe('plan job', () => {
  afterEach(() => vi.unstubAllGlobals());

  const dbRecipes = [
    { id: 'pasta', title: 'Creamy spinach pasta', total_minutes: 25, servings: 4, is_favorite: true, last_cooked_at: null, recipe_ingredients: [{ name: 'Spinach', product_id: 'spinach', is_optional: false, position: 0 }] },
    { id: 'tacos', title: 'Fish tacos', total_minutes: 30, servings: 4, is_favorite: false, last_cooked_at: null, recipe_ingredients: [] },
    { id: 'curry', title: 'Chicken curry', total_minutes: 40, servings: 4, is_favorite: false, last_cooked_at: null, recipe_ingredients: [] },
  ];
  const answer = (recipes: unknown[], tokens: unknown[] = []) => (c: Call) => {
    if (c.table === 'pantry_status') return pantryRows;
    if (c.table === 'household_staples') return [];
    if (c.table === 'recipes') return recipes;
    if (c.table === 'up_next') return [{ recipe_id: 'curry', servings: 4 }];
    if (c.table === 'import_jobs' && c.op === 'select') return { id: 'job-1' };
    if (c.table === 'push_tokens') return tokens;
    return null;
  };
  const run = (askJson: () => Promise<unknown>, job: Partial<ImportJob>, recipes: unknown[] = dbRecipes, tokens: unknown[] = []) => {
    const { db, calls } = fakeDb(answer(recipes, tokens));
    const deps = fakeDeps(db, askJson);
    return processJob(deps, fakeJob({ kind: 'plan', input_text: 'week', ...job }), silent, { shutdown: new AbortController().signal }).then(() => ({ deps, calls }));
  };

  it('stores a WeekPlan from the household recipes, leaving the menu out and writing nothing else', async () => {
    const { deps, calls } = await run(async () => ({ dinners: [{ recipe: 'R1', day: 'Friday', why: 'Spinach first', uses_soon: ['spinach'] }, { recipe: 'R3', day: null, why: 'x', uses_soon: [] }], note: null }), {});
    const prompt = (vi.mocked(deps.ai.askJson).mock.calls[0]![0] as { parts: { text: string }[] }).parts[0]!.text;
    expect(prompt).toContain('R1 | Creamy spinach pasta');
    expect(prompt).toContain('Already on the menu: Chicken curry');
    expect(prompt).not.toContain('| Chicken curry');
    expect(calls.find((c) => c.table === 'recipes')!.filters).toContainEqual(['eq', 'household_id', 'h1']);
    expect(jobUpdate(calls)).toMatchObject({
      status: 'done',
      result: { wishes: null, dinners: [{ recipe_id: 'pasta', title: 'Creamy spinach pasta', day: 'Friday', why: 'Spinach first', uses_soon: ['Spinach'] }], note: null },
    });
    expect(calls.filter((c) => c.op !== 'select' && c.table !== 'import_jobs')).toEqual([]);
  });

  it('says to save recipes first when there is none, and planFailed when no dinner is usable', async () => {
    const none = await run(async () => ({}), {}, []);
    expect(none.deps.ai.askJson).not.toHaveBeenCalled();
    expect(jobUpdate(none.calls)).toMatchObject({ status: 'failed', error: MESSAGES.planNoRecipes, error_code: 'planNoRecipes' });

    const invented = await run(async () => ({ dinners: [{ recipe: 'R42', day: null, why: 'Invented', uses_soon: [] }], note: null }), {});
    expect(jobUpdate(invented.calls)).toMatchObject({ status: 'failed', error: MESSAGES.planFailed, error_code: 'planFailed' });
  });

  it('pushes "Your week" with the dinners after a long wait', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await run(
      async () => ({ dinners: [{ recipe: 'R1', day: null, why: 'a', uses_soon: [] }, { recipe: 'R2', day: null, why: 'b', uses_soon: [] }], note: null }),
      { input_text: 'Quick on weekdays', created_at: new Date(Date.now() - 60_000).toISOString() },
      dbRecipes,
      [{ token: 'ExponentPushToken[1]' }],
    );
    const sent = JSON.parse(String(fetch.mock.calls[0]![1].body));
    expect(sent[0]).toMatchObject({ title: 'Your week: 2 dinners', body: 'Creamy spinach pasta · Fish tacos', data: { jobId: 'job-1', kind: 'plan' } });
  });
});
