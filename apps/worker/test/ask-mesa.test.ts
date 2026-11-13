import type { ImportJob } from '@mesa/shared';
import { describe, expect, it, vi } from 'vitest';

import { askSystemPrompt, earlierTurns, rankRecipes } from '../src/ask-mesa';
import { checkAnswer } from '../src/ask-output';
import { recipeBlock } from '../src/ask-recipe';
import { isImportError, MESSAGES } from '../src/errors';
import { processJob } from '../src/runner';
import { buildPantry, type FullRecipe, type KitchenRecipe } from '../src/kitchen-context';
import { recipeRefs, servingsAsked } from '../src/kitchen-text';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

const ctx = {
  refs: recipeRefs(['tinga', 'soup']),
  titles: new Map([
    ['tinga', 'Chicken tinga'],
    ['soup', 'Lentil soup'],
  ]),
  onMenu: new Set(['soup']),
  about: null,
};

describe('checkAnswer', () => {
  it('keeps listed recipes once with their own title, and drops unknown ones', () => {
    const out = checkAnswer(
      {
        on_topic: true,
        answer: '  You can make the tinga tonight.  ',
        recipes: [
          { recipe: 'R1', why: 'Chicken at home' },
          { recipe: 'R9', why: 'Invented' },
          { recipe: 'r1', why: 'Again' },
          { recipe: 'soup', why: 'Lentils' },
          { recipe: 'made-up', why: 'x' },
        ],
        actions: [],
      },
      ctx,
    );
    expect(out).toEqual({
      answer: 'You can make the tinga tonight.',
      recipes: [
        { recipe_id: 'tinga', title: 'Chicken tinga', why: 'Chicken at home' },
        { recipe_id: 'soup', title: 'Lentil soup', why: 'Lentils' },
      ],
      actions: [],
    });
  });

  it('shapes the actions: list items in unit codes, known recipes only, no planning what is on the menu, three at most', () => {
    const out = checkAnswer(
      {
        answer: 'Here is what you need.',
        recipes: [],
        actions: [
          { kind: 'plan', label: 'Plan', recipe: 'R2', query: null, items: [] },
          { kind: 'open_recipe', label: 'Open', recipe: 'R7', query: null, items: [] },
          { kind: 'add_to_list', label: '', recipe: null, query: null, items: [
            { label: 'Tortillas', quantity: 1, unit: 'kg' },
            { label: ' ', quantity: 2, unit: null },
            { label: 'Cilantro', quantity: null, unit: 'bunch' },
            { label: 'Limes', quantity: 3, unit: null },
          ] },
          { kind: 'find', label: 'Find', recipe: null, query: '  ', items: [] },
          { kind: 'cook', label: 'Cook', recipe: 'R1', query: null, items: [] },
          { kind: 'plan', label: 'Plan the tinga', recipe: 'R1', query: null, items: [] },
          { kind: 'plan', label: 'Plan it again', recipe: 'tinga', query: null, items: [] },
          { kind: 'find', label: 'Find tacos', recipe: null, query: 'tacos al pastor', items: [] },
          { kind: 'open_recipe', label: 'Open', recipe: 'R1', query: null, items: [] },
        ],
      },
      ctx,
    );
    expect(out.actions).toEqual([
      {
        kind: 'add_to_list',
        label: 'Add to list',
        items: [
          { label: 'Tortillas', quantity: 1000, unit: 'g' },
          { label: 'Cilantro', quantity: null, unit: null },
          { label: 'Limes', quantity: 3, unit: 'unit' },
        ],
      },
      { kind: 'plan', label: 'Plan the tinga', recipe_id: 'tinga' },
      { kind: 'find', label: 'Find tacos', query: 'tacos al pastor' },
    ]);
  });

  it('plan_week: its wishes cleaned (null when none), a default label, once', () => {
    const out = checkAnswer(
      {
        answer: 'Mesa will plan your week from your recipes.',
        recipes: [],
        actions: [
          { kind: 'plan_week', label: 'Planifier ma semaine', recipe: null, query: null, wishes: '  rapide en semaine,   sans viande ', items: [] },
          { kind: 'plan_week', label: 'Again', recipe: null, query: null, wishes: null, items: [] },
        ],
      },
      ctx,
    );
    expect(out.actions).toEqual([{ kind: 'plan_week', label: 'Planifier ma semaine', wishes: 'rapide en semaine, sans viande' }]);
    const bare = checkAnswer({ answer: 'Sure.', actions: [{ kind: 'plan_week', label: '', wishes: '  ' }] }, ctx);
    expect(bare.actions).toEqual([{ kind: 'plan_week', label: 'Plan my week', wishes: null }]);
  });

  it('find: one search (the app runs it at once), its query cleaned like a typed search', () => {
    const out = checkAnswer(
      {
        answer: 'Here are videos for pad kra pao.',
        recipes: [],
        actions: [
          { kind: 'find', label: 'pad kra pao', query: '"pad kra pao" 🌶️ #thai', items: [] },
          { kind: 'find', label: 'More', query: 'green curry', items: [] },
        ],
      },
      ctx,
    );
    expect(out.actions).toEqual([{ kind: 'find', label: 'pad kra pao', query: 'pad kra pao' }]);
    expect(checkAnswer({ answer: 'x', actions: [{ kind: 'find', label: 'x', query: 'ab' }] }, ctx).actions).toEqual([]);
  });

  it('about a recipe: never points to it or opens it again, but may plan it', () => {
    const out = checkAnswer(
      {
        answer: 'Use Greek yogurt instead of the cream.',
        recipes: [{ recipe: 'R1', why: 'This one' }, { recipe: 'R2', why: 'Lighter' }],
        actions: [
          { kind: 'open_recipe', label: 'Open', recipe: 'R1' },
          { kind: 'plan', label: 'Plan it', recipe: 'R1' },
        ],
      },
      { ...ctx, onMenu: new Set<string>(), about: 'tinga' },
    );
    expect(out.recipes).toEqual([{ recipe_id: 'soup', title: 'Lentil soup', why: 'Lighter' }]);
    expect(out.actions).toEqual([{ kind: 'plan', label: 'Plan it', recipe_id: 'tinga' }]);
  });

  it('keeps answers to 80 words, and an off-topic answer alone', () => {
    const long = checkAnswer({ answer: 'word '.repeat(120), recipes: [], actions: [] }, ctx);
    expect(long.answer.split(' ').length).toBeLessThanOrEqual(80);
    expect(long.answer.endsWith('…')).toBe(true);

    const off = checkAnswer(
      { on_topic: false, answer: 'I can only help with your kitchen.', recipes: [{ recipe: 'R1', why: 'x' }], actions: [{ kind: 'find', label: 'x', query: 'x' }] },
      ctx,
    );
    expect(off).toEqual({ answer: 'I can only help with your kitchen.', recipes: [], actions: [] });
  });

  it('fails with askFailed when there is no answer', () => {
    let err: unknown;
    try {
      checkAnswer({ answer: '  ', recipes: [], actions: [] }, ctx);
    } catch (e) {
      err = e;
    }
    expect(isImportError(err) && err.userMessage === MESSAGES.askFailed).toBe(true);
  });
});

describe('earlierTurns', () => {
  it('keeps well-formed turns, the last six, newest last', () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
    expect(earlierTurns([...turns, { q: 'no answer' }, null, 'x']).map((t) => t.q)).toEqual(['q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
    expect(earlierTurns(null)).toEqual([]);
  });
});

describe('rankRecipes', () => {
  const recipe = (id: string, title: string, products: string[], is_favorite = false): KitchenRecipe => ({
    id, title, total_minutes: 20, servings: 2, is_favorite, last_cooked_at: null, source_author: null,
    ingredients: products.map((p) => ({ name: p, product_id: p, is_optional: false })),
  });
  const pantry = buildPantry([{ product_id: 'rice', name_en: 'Rice', state: 'ok', expires_on: null, quantity: null, unit: null, level: null }], []);

  it('lists recipes sharing words with the question first, then the best fits', () => {
    const recipes = [recipe('a', 'Beef stew', ['beef']), recipe('b', 'Fried rice', ['rice']), recipe('c', 'Spinach omelette', ['egg', 'spinach']), recipe('d', 'Pie', ['flour'], true)];
    expect(rankRecipes(recipes, pantry, '¿Qué hago con las espinacas? spinach').map((r) => r.recipe.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(rankRecipes(recipes, pantry, 'x', 2)).toHaveLength(2);
  });
});

const PASTA_ID = '0b9a2f0e-2c1d-4c39-9d7e-1f3f5a7c9e11';
const pasta: FullRecipe = {
  id: PASTA_ID,
  title: 'Pasta alla panna',
  servings: 4,
  total_minutes: 25,
  ingredients: [
    { name: 'Pasta', raw_text: '400 g pasta', quantity: 400, unit: 'g', product_id: 'pasta', is_optional: false },
    { name: 'Cream', raw_text: '200 ml panna', quantity: 200, unit: 'ml', product_id: 'cream', is_optional: false },
    { name: 'Parmesan', raw_text: 'parmigiano q.b.', quantity: null, unit: null, product_id: 'parmesan', is_optional: true },
    { name: 'Egg', raw_text: '3 uova', quantity: 3, unit: 'unit', product_id: 'egg', is_optional: false },
  ],
  steps: ['Cuocere la pasta.', 'Scaldare la panna.'],
};

describe('recipeBlock', () => {
  const pantry = buildPantry(
    [
      { product_id: 'pasta', name_en: 'Pasta', state: 'ok', expires_on: null, quantity: null, unit: null, level: null },
      { product_id: 'egg', name_en: 'Egg', state: 'ok', expires_on: null, quantity: 6, unit: 'unit', level: null },
    ],
    [{ id: 'parmesan', name_en: 'Parmesan' }],
  );

  it('writes the recipe in full: every line as written (with its food when the line does not say it), what is at home, the steps', () => {
    const block = recipeBlock(pasta, 'R1', pantry, null);
    expect(block).toBe(`The question is about this saved recipe:
R1 | Pasta alla panna | serves 4 | 25 min
Ingredients:
1. 400 g pasta · at home
2. 200 ml panna (Cream) · not at home
3. parmigiano q.b. (Parmesan) (optional) · at home
4. 3 uova (Egg) · at home
Steps:
1. Cuocere la pasta.
2. Scaldare la panna.`);
  });

  it('gives the amounts for the servings asked, scaled in code, and says to copy them', () => {
    const block = recipeBlock(pasta, 'R1', pantry, servingsAsked('for 2'));
    expect(block).toContain('Asked for 2 servings (the recipe serves 4)');
    expect(block).toContain('never compute your own. The question only asks for these amounts.');
    expect(block).toContain('1. 400 g pasta → for 2: 200 g · at home');
    expect(block).toContain('2. 200 ml panna (Cream) → for 2: 100 ml · not at home');
    expect(block).toContain('3. parmigiano q.b. (Parmesan) → for 2: as written (optional) · at home');
    expect(block).toContain('4. 3 uova (Egg) → for 2: 1½ · at home'); // counts never print decimals (shared formatQuantity)
    // Six for a recipe of 4, as part of a longer question; the recipe's own servings: nothing to scale.
    expect(recipeBlock(pasta, 'R1', pantry, servingsAsked('¿y para 6 personas sin nata?'))).toContain('2. 200 ml panna (Cream) → for 6: 300 ml');
    expect(recipeBlock(pasta, 'R1', pantry, servingsAsked('¿y para 6 personas sin nata?'))).not.toContain('only asks');
    expect(recipeBlock(pasta, 'R1', pantry, servingsAsked('pour 4 personnes'))).not.toContain('→');
  });
});

describe('ask job', () => {
  const answer = (c: Call) => {
    if (c.table === 'pantry_status') return [{ product_id: 'spinach', name_en: 'Spinach', state: 'soon', expires_on: '2026-11-07', quantity: 200, unit: 'g', level: null }];
    if (c.table === 'household_staples') return [];
    if (c.table === 'recipes') return [
      { id: 'omelette', title: 'Tortilla de espinacas', total_minutes: 15, servings: 2, is_favorite: false, last_cooked_at: null, recipe_ingredients: [{ name: 'Spinach', product_id: 'spinach', is_optional: false, position: 0 }] },
      { id: 'stew', title: 'Beef stew', total_minutes: 120, servings: 4, is_favorite: false, last_cooked_at: null, recipe_ingredients: [] },
    ];
    if (c.table === 'grocery_items') return [{ label: 'Leche', quantity: 1000, unit: 'ml' }];
    if (c.table === 'up_next') return [{ recipe_id: 'stew', servings: 4 }];
    return null;
  };
  const run = async (job: Partial<ImportJob>, raw: unknown) => {
    const { db, calls } = fakeDb(answer);
    const deps = fakeDeps(db, async () => raw);
    await processJob(deps, fakeJob({ kind: 'ask', ...job }), silent, { shutdown: new AbortController().signal });
    return { deps, calls };
  };

  it('asks with the kitchen and the earlier turns, and stores a checked answer', async () => {
    const { deps, calls } = await run(
      { input_text: '¿Qué hago con las espinacas?', input_context: [{ q: '¿Tenemos arroz?', a: 'No, no hay arroz en casa.' }] },
      { on_topic: true, answer: 'Una tortilla de espinacas, 15 min.', recipes: [{ recipe: 'R1', why: 'Usa las espinacas' }], actions: [{ kind: 'open_recipe', label: 'Abrir', recipe: 'R1', query: null, items: [] }] },
    );
    const prompt = (vi.mocked(deps.ai.askJson).mock.calls[0]![0] as { parts: { text: string }[] }).parts[0]!.text;
    expect(prompt).toContain('R1 | Tortilla de espinacas | 15 min | at home 1/1 | Spinach');
    expect(prompt).toContain('At home (soonest to use first): Spinach (200 g, use by 2026-11-07)');
    expect(prompt).toContain('Shopping list: Leche (1 L)');
    expect(prompt).toContain('On the menu: Beef stew (R2, 4 servings)');
    expect(prompt).toContain('Q: ¿Tenemos arroz?\nA: No, no hay arroz en casa.');
    expect(prompt.trim().endsWith('Question: ¿Qué hago con las espinacas?')).toBe(true);
    expect(calls.find((c) => c.table === 'grocery_items')!.filters).toContainEqual(['in', 'status', ['to_buy']]);
    expect(jobUpdate(calls)).toMatchObject({
      status: 'done',
      result: {
        answer: 'Una tortilla de espinacas, 15 min.',
        recipes: [{ recipe_id: 'omelette', title: 'Tortilla de espinacas', why: 'Usa las espinacas' }],
        actions: [{ kind: 'open_recipe', label: 'Abrir', recipe_id: 'omelette' }],
      },
    });
    expect(calls.filter((c) => c.op !== 'select' && c.table !== 'import_jobs')).toEqual([]);
  });

  describe('about a recipe (subject_id)', () => {
    const fullRow = {
      id: PASTA_ID, title: 'Pasta alla panna', servings: 4, total_minutes: 25,
      recipe_ingredients: [
        { name: 'Cream', raw_text: '200 ml panna', quantity: 200, unit: 'ml', product_id: 'cream', is_optional: false, position: 1 },
        { name: 'Pasta', raw_text: '400 g pasta', quantity: 400, unit: 'g', product_id: 'pasta', is_optional: false, position: 0 },
      ],
      recipe_steps: [{ text: 'Aggiungere la panna.', position: 1 }, { text: 'Cuocere la pasta.', position: 0 }],
    };
    const withRecipe = (found: boolean) => (c: Call) => {
      if (c.table === 'recipes' && c.filters.some((f) => f[0] === 'maybeSingle')) return found ? fullRow : null;
      if (c.table === 'recipes') return [
        { id: PASTA_ID, title: 'Pasta alla panna', total_minutes: 25, servings: 4, is_favorite: false, last_cooked_at: null, recipe_ingredients: [] },
        { id: 'stew', title: 'Beef stew', total_minutes: 120, servings: 4, is_favorite: false, last_cooked_at: null, recipe_ingredients: [] },
      ];
      return answer(c);
    };
    const runAbout = async (input_text: string, found: boolean, raw: unknown, subject_id = PASTA_ID) => {
      const { db, calls } = fakeDb(withRecipe(found));
      const deps = fakeDeps(db, async () => raw);
      await processJob(deps, fakeJob({ kind: 'ask', input_text, subject_id }), silent, { shutdown: new AbortController().signal });
      const request = vi.mocked(deps.ai.askJson).mock.calls[0]![0] as { parts: { text: string }[]; systemInstruction: string };
      return { calls, prompt: request.parts[0]!.text, system: request.systemInstruction };
    };

    it('puts the recipe first, in full, as R1, with the amounts for "for 2" computed, and answers about it', async () => {
      const { calls, prompt, system } = await runAbout('for 2', true, {
        on_topic: true,
        answer: 'Per 2: 200 g di pasta e 100 ml di panna.',
        recipes: [{ recipe: 'R1', why: 'x' }],
        actions: [{ kind: 'add_to_list', label: 'Aggiungi', recipe: null, query: null, wishes: null, items: [{ label: 'Panna', quantity: 100, unit: 'ml' }] }],
      });
      expect(prompt.startsWith('The question is about this saved recipe:\nR1 | Pasta alla panna | serves 4 | 25 min\nAsked for 2 servings')).toBe(true);
      expect(prompt).toContain('1. 400 g pasta → for 2: 200 g · not at home\n2. 200 ml panna (Cream) → for 2: 100 ml · not at home');
      expect(prompt).toContain('Steps:\n1. Cuocere la pasta.\n2. Aggiungere la panna.');
      // Listed once: as the recipe asked about, not again among the others.
      expect(prompt).toContain('Other saved recipes');
      expect(prompt).toContain('R2 | Beef stew');
      expect(prompt).not.toContain('R2 | Pasta alla panna');
      expect(prompt).toContain('On the menu: Beef stew (R2, 4 servings)');
      expect(system).toContain('The question is about the recipe shown first');
      expect(system).toContain('copy them exactly, never compute your own');
      expect(system).toContain('from the food at home or the staples first');
      const full = calls.find((c) => c.table === 'recipes' && c.filters.some((f) => f[0] === 'maybeSingle'))!;
      expect(full.filters).toContainEqual(['eq', 'id', PASTA_ID]);
      expect(full.filters).toContainEqual(['eq', 'household_id', 'h1']);
      expect(jobUpdate(calls)).toMatchObject({
        status: 'done',
        result: {
          answer: 'Per 2: 200 g di pasta e 100 ml di panna.',
          recipes: [],
          actions: [{ kind: 'add_to_list', label: 'Aggiungi', items: [{ label: 'Panna', quantity: 100, unit: 'ml' }] }],
        },
      });
    });

    it('ignores a recipe that is not the household\'s (or not a recipe id): a plain question', async () => {
      const raw = { on_topic: true, answer: 'Usa yogur griego.', recipes: [], actions: [] };
      const other = await runAbout('¿sin nata?', false, raw);
      expect(other.prompt.startsWith('Today is')).toBe(true);
      expect(other.prompt).toContain('Saved recipes (ref');
      expect(other.system).not.toContain('recipe shown first');
      expect(jobUpdate(other.calls)).toMatchObject({ status: 'done', result: { answer: 'Usa yogur griego.' } });

      const notId = await runAbout('¿sin nata?', true, raw, 'r1');
      expect(notId.prompt.startsWith('Today is')).toBe(true);
      expect(notId.calls.some((c) => c.table === 'recipes' && c.filters.some((f) => f[0] === 'maybeSingle'))).toBe(false);
    });
  });

  it('fails with askFailed for an empty question, without asking the model', async () => {
    const { deps, calls } = await run({ input_text: ' ' }, {});
    expect(deps.ai.askJson).not.toHaveBeenCalled();
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error: MESSAGES.askFailed, error_code: 'askFailed' });
  });

  it('tells the model never to invent a recipe and to refuse off-topic questions in one line', () => {
    const prompt = askSystemPrompt();
    expect(prompt).toContain('Never invent a recipe');
    expect(prompt).toContain('on_topic to false');
    expect(prompt).toContain('language of the question');
    expect(prompt).not.toContain('recipe shown first');
  });

  it('hands planning to plan_week and new dishes to a find the app runs at once', () => {
    const prompt = askSystemPrompt();
    expect(prompt).toContain('plan_week: when they ask to plan meals, the week');
    expect(prompt).toContain('Never plan in the answer');
    expect(prompt).toContain('find: when they want something new, or nothing saved fits');
    expect(prompt).toContain("in the dish's own language when obvious");
    expect(prompt).toContain('say "Here are videos for …"');
    expect(prompt).toContain('never "tap to search"');
  });
});
