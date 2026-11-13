// Redo ingredients (kind reread) end to end through processJob: a fake database, a real catalog store and
// a fake model call for the names.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, ImportJob, Product, ProductAlias } from '@mesa/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogStore, memoryCatalogReader } from '../src/catalog-store';
import { ImportError, MESSAGES } from '../src/errors';
import { readIngredientLines } from '../src/ingredient-lines';
import { processJob } from '../src/runner';
import type { Translation } from '../src/model-output';
import type { PipelineDeps } from '../src/pipeline';
import type { StoredLine } from '../src/reread';
import { fakeDb, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

const H = 'h1';
const product = (id: string, name_en: string, category: Category, household_id: string | null = null): Product => ({
  id, household_id, name_en, category, default_zone: 'cupboard', shelf_life_days: null, is_staple: false, unit_family: 'count',
});
const alias = (product_id: string, a: string): ProductAlias => ({ product_id, alias: a, lang: 'en' });

function store(): CatalogStore {
  return new CatalogStore(
    memoryCatalogReader(
      [
        product('pineapple', 'Pineapple', 'produce'),
        product('egg', 'Egg', 'dairy'),
        product('lime', 'Lime', 'produce'),
        // What an old import made: a vague household product that swallowed lines.
        product('h-other', 'Other', 'other', H),
      ],
      [alias('pineapple', 'pineapple'), alias('egg', 'egg'), alias('egg', 'eggs'), alias('lime', 'lime'), alias('h-other', 'other')],
    ),
    silent,
  );
}

const line = (over: Partial<StoredLine> & Pick<StoredLine, 'id' | 'position' | 'raw_text' | 'name'>): StoredLine => ({
  product_id: null, quantity: null, unit: null, is_guessed: false, is_optional: false, section: null, ...over,
});

/** recipes.updated_at as PostgREST gives it: microseconds, handed back exactly. */
const READ_AT = '2026-11-07T10:00:00.123456+00:00';

// Positions with gaps, as an editor or an old import may leave them.
const STORED: StoredLine[] = [
  line({ id: 'a', position: 0, raw_text: '2 tbsp sour shrimp paste', name: 'Sour shrimp paste', quantity: 2, unit: 'tbsp' }),
  line({ id: 'b', position: 1, raw_text: 'half a pineapple', name: 'Other', product_id: 'h-other', quantity: 0.5, unit: 'unit' }),
  line({ id: 'c', position: 2, raw_text: 'chả chiên (Vietnamese ham)', name: 'Chả chiên', quantity: 200, unit: 'g', is_guessed: true }),
  line({ id: 'd', position: 5, raw_text: '3 eggs ', name: 'Other', quantity: 2, unit: 'unit', is_guessed: true }),
  line({ id: 'e', position: 6, raw_text: '---', name: '---' }),
  line({ id: 'f', position: 9, raw_text: 'lime wedges', name: 'Lime', product_id: 'lime', is_optional: true, section: 'To serve' }),
];

// The model: "paste" for the shrimp paste (vague), nothing for "---".
const NAMES = new Map<number, Translation>([
  [0, { name_en: 'paste', category: 'cupboard', is_optional: false }],
  [2, { name_en: 'vietnamese ham', category: 'meat', is_optional: false }],
  [5, { name_en: 'lime', category: 'produce', is_optional: false }],
]);

interface Kitchen {
  stored?: StoredLine[];
  /** apply_reread's answer: false when the recipe was edited while it was read. */
  applied?: unknown;
  tokens?: unknown[];
}

function kitchen({ stored = STORED, applied = true, tokens = [] }: Kitchen = {}) {
  return fakeDb((c: Call) => {
    const has = (...f: unknown[]) => c.filters.some((x) => JSON.stringify(x) === JSON.stringify(f));
    if (c.table === 'recipes' && c.op === 'select') return has('eq', 'id', 'r1') && has('eq', 'household_id', H) ? { id: 'r1', updated_at: READ_AT, language: 'vi' } : null;
    if (c.table === 'apply_reread') return applied;
    if (c.table === 'recipe_ingredients' && c.op === 'select') return stored;
    if (c.table === 'products' && c.op === 'insert') {
      const p = c.payload as { name_en: string; category: Category };
      return product(`new-${p.name_en.toLowerCase()}`, p.name_en, p.category, H);
    }
    if (c.table === 'import_jobs' && c.op === 'select') return { id: 'job-1' };
    if (c.table === 'push_tokens') return tokens;
    return null;
  });
}

function deps(db: SupabaseClient, translate: () => Promise<Map<number, Translation>>): PipelineDeps {
  return { db, ai: { translateNames: vi.fn(translate) }, catalog: store(), config: { expoAccessToken: null } } as unknown as PipelineDeps;
}

const job = (over: Partial<ImportJob> = {}): ImportJob => fakeJob({ kind: 'reread', subject_id: 'r1', input_text: 'Bánh mì', ...over });
const run = (d: PipelineDeps, j: ImportJob) => processJob(d, j, silent, { shutdown: new AbortController().signal });
const written = (calls: Call[]) => calls.filter((c) => c.table === 'apply_reread' || (c.table === 'recipe_ingredients' && c.op !== 'select'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reread job', () => {
  it('reads every line again, in order, in place: text untouched, amounts the line lacks kept', async () => {
    const { db, calls } = kitchen();
    const d = deps(db, async () => NAMES);
    await run(d, job());

    // Only the lines no catalog name matches exactly go to the model, with the known names they mention.
    const [pending, known] = vi.mocked(d.ai.translateNames).mock.calls[0]!;
    expect(pending).toEqual([
      { i: 0, line: '2 tbsp sour shrimp paste' },
      { i: 2, line: 'chả chiên (Vietnamese ham)' },
      { i: 4, line: '---' },
      { i: 5, line: 'lime wedges' },
    ]);
    expect(known).toEqual(['Lime']);
    expect(known).not.toContain('Other');
    expect(calls.find((c) => c.table === 'recipes')!.filters).toContainEqual(['eq', 'household_id', H]);
    expect(calls.find((c) => c.table === 'recipe_ingredients')!.filters).toContainEqual(['order', 'position']);

    // One write, by id, only if the recipe is as it was read: nothing inserted, nothing deleted.
    const writes = written(calls);
    expect(writes.map((c) => c.op)).toEqual(['rpc']);
    const args = writes[0]!.payload as { p_recipe: string; p_read_at: string; p_rows: unknown };
    expect(args.p_recipe).toBe('r1');
    expect(args.p_read_at).toBe(READ_AT);
    const base = { is_guessed: false, is_optional: false, section: null };
    expect(args.p_rows).toEqual([
      // "paste" says nothing: the line's own label names the new product.
      { ...base, id: 'a', position: 0, raw_text: '2 tbsp sour shrimp paste', name: 'Sour shrimp paste', product_id: 'new-sour shrimp paste', quantity: 2, unit: 'tbsp' },
      // Off the vague "Other", onto the catalog's Pineapple.
      { ...base, id: 'b', position: 1, raw_text: 'half a pineapple', name: 'Pineapple', product_id: 'pineapple', quantity: 0.5, unit: 'unit' },
      // No amount in the text: the one the import read (and its "guessed") stays.
      { ...base, id: 'c', position: 2, raw_text: 'chả chiên (Vietnamese ham)', name: 'Vietnamese ham', product_id: 'new-vietnamese ham', quantity: 200, unit: 'g', is_guessed: true },
      // The amount the text says wins, and is not a guess; the text keeps its trailing space.
      { ...base, id: 'd', position: 3, raw_text: '3 eggs ', name: 'Egg', product_id: 'egg', quantity: 3, unit: 'unit' },
      // Nothing names it: exactly as it was (only renumbered).
      { ...STORED[4], position: 4 },
      // Optional for the import (it saw "For serving:"), still optional, still in its section.
      { ...base, id: 'f', position: 5, raw_text: 'lime wedges', name: 'Lime', product_id: 'lime', quantity: null, unit: null, is_optional: true, section: 'To serve' },
    ]);

    const created = calls.filter((c) => c.table === 'products' && c.op === 'insert').map((c) => (c.payload as { name_en: string }).name_en);
    expect(created).toEqual(['Sour shrimp paste', 'Vietnamese ham']);

    expect(jobUpdate(calls)).toMatchObject({ status: 'done', error: null, result: { lines: 6, linked: 5 } });
    // Nothing else of the recipe is written: title, steps, favorite stay (the database touches updated_at).
    expect(calls.filter((c) => c.op !== 'select' && !['apply_reread', 'products', 'product_aliases', 'import_jobs'].includes(c.table))).toEqual([]);
    expect(calls.some((c) => c.table === 'recipe_steps')).toBe(false);
  });

  it('refuses a recipe of another household', async () => {
    const { db, calls } = kitchen();
    const d = deps(db, async () => NAMES);
    await run(d, job({ household_id: 'h2' }));
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error: MESSAGES.rereadFailed, error_code: 'rereadFailed' });
    expect(d.ai.translateNames).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.op !== 'select' && c.table !== 'import_jobs')).toEqual([]);

    const none = kitchen();
    await run(deps(none.db, async () => NAMES), job({ subject_id: null }));
    expect(jobUpdate(none.calls)).toMatchObject({ status: 'failed', error_code: 'rereadFailed' });
  });

  it('fails and leaves the lines untouched when the model fails (busy said as busy)', async () => {
    const broken = kitchen();
    await run(deps(broken.db, async () => { throw new Error('503 from the model'); }), job());
    expect(jobUpdate(broken.calls)).toMatchObject({ status: 'failed', error: MESSAGES.rereadFailed, error_code: 'rereadFailed' });
    expect(broken.calls.filter((c) => c.op !== 'select' && c.table !== 'import_jobs')).toEqual([]);

    const busy = kitchen();
    await run(deps(busy.db, async () => { throw new ImportError('aiBusy'); }), job());
    expect(jobUpdate(busy.calls)).toMatchObject({ status: 'failed', error_code: 'aiBusy' });
    expect(written(busy.calls)).toEqual([]);
  });

  it('never overwrites an edit made while it read: the database refuses, and the reread fails', async () => {
    const { db, calls } = kitchen({ applied: false });
    await run(deps(db, async () => NAMES), job());
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error_code: 'rereadFailed' });
    expect(calls.some((c) => c.table === 'recipe_ingredients' && c.op !== 'select')).toBe(false);
  });

  it('gives a recipe saved without sections the parts its steps show, and keeps a sectioned one as it is', async () => {
    const plain = STORED.map((l) => ({ ...l, section: null }));
    const { db, calls } = kitchen({ stored: plain });
    const d = deps(db, async () => NAMES);
    const askJson = vi.fn(async () => ({ parts: [{ name: 'Filling', lines: [1, 3, 4] }, { name: 'To serve', lines: [2, 5, 6] }] }));
    (d.ai as unknown as { askJson: typeof askJson }).askJson = askJson;
    await run(d, job());
    expect(askJson).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.table === 'recipe_steps')).toBe(true);
    const rows = (written(calls)[0]!.payload as { p_rows: StoredLine[] }).p_rows;
    expect(rows.map((r) => [r.id, r.position, r.section])).toEqual([
      ['a', 0, 'Filling'], ['c', 1, 'Filling'], ['d', 2, 'Filling'], ['b', 3, 'To serve'], ['e', 4, 'To serve'], ['f', 5, 'To serve'],
    ]);
    // STORED has a section ("To serve"): the model is not asked.
    const kept = kitchen();
    const k = deps(kept.db, async () => NAMES);
    const never = vi.fn();
    (k.ai as unknown as { askJson: typeof never }).askJson = never;
    await run(k, job());
    expect(never).not.toHaveBeenCalled();
  });

  it('a recipe with no lines is done at once, without the model', async () => {
    const { db, calls } = kitchen({ stored: [] });
    const d = deps(db, async () => NAMES);
    await run(d, job());
    expect(d.ai.translateNames).not.toHaveBeenCalled();
    expect(jobUpdate(calls)).toMatchObject({ status: 'done', result: { lines: 0, linked: 0 } });
    expect(written(calls)).toEqual([]);
  });

  it('pushes "Ingredients up to date" after a long wait, but never for one the server queued', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const longAgo = new Date(Date.now() - 60_000).toISOString();

    const asked = kitchen({ tokens: [{ token: 'ExponentPushToken[1]' }] });
    await run(deps(asked.db, async () => NAMES), job({ created_at: longAgo }));
    const sent = JSON.parse(String(fetch.mock.calls[0]![1].body));
    expect(sent[0]).toMatchObject({
      title: 'Ingredients up to date',
      body: '6 lines read again, 5 linked to your kitchen.',
      data: { jobId: 'job-1', kind: 'reread', recipeId: 'r1' },
    });

    // Migration 22 queues rereads with no created_by: nobody waits for them, nobody is told.
    const queued = kitchen({ tokens: [{ token: 'ExponentPushToken[1]' }] });
    await run(deps(queued.db, async () => NAMES), job({ created_at: longAgo, created_by: null }));
    expect(jobUpdate(queued.calls)).toMatchObject({ status: 'done' });
    expect(queued.calls.some((c) => c.table === 'push_tokens')).toBe(false);
    const failed = kitchen({ tokens: [{ token: 'ExponentPushToken[1]' }] });
    await run(deps(failed.db, async () => { throw new Error('503'); }), job({ created_at: longAgo, created_by: null }));
    expect(failed.calls.some((c) => c.table === 'push_tokens')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('readIngredientLines', () => {
  it('gives one entry per line, null where nothing names it, and lets a failed model call through', async () => {
    const catalog = await store().forHousehold(H);
    const read = await readIngredientLines(['1 egg', '---', '½'], catalog, async () => new Map());
    expect(read.map((r) => r?.name_en ?? null)).toEqual(['egg', null, null]);
    await expect(readIngredientLines(['1 cup jamaica flowers'], catalog, async () => { throw new Error('503'); })).rejects.toThrow('503');
  });
});
