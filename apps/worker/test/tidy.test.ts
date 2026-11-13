import { describe, expect, it, vi } from 'vitest';

import { buildCatalog } from '../src/mapping';
import { toStepStarts } from '../src/model-output';
import { normalizeTidy, runTidy, tidySystemPrompt } from '../src/tidy';
import { fakeDb, FakeDbError, fakeDeps, fakeJob, silent, type Call } from './fake-deps';

describe('normalizeTidy', () => {
  it('keeps complete answers keyed by normalized name', () => {
    const out = normalizeTidy({
      items: [
        {
          name: 'Flor de Jamaica',
          category: 'cupboard',
          family: 'drinks',
          picto: 'herb',
          default_zone: 'cupboard',
          shelf_life_days: null,
          unit_family: 'mass',
          same_as: null,
          aliases: [{ lang: 'en', name: 'Hibiscus Flower' }, { lang: 'xx', name: 'nope' }, { lang: 'fr', name: 'x' }],
        },
      ],
    });
    const a = out.get('flor de jamaica');
    expect(a?.family).toBe('drinks');
    expect(a?.aliases).toEqual([{ lang: 'en', name: 'hibiscus flower' }]);
  });

  it('drops answers with an unknown family or picto, and bad shelf lives', () => {
    const out = normalizeTidy({
      items: [
        { name: 'a', category: 'produce', family: 'veggies', picto: 'tomato', default_zone: 'fridge', shelf_life_days: 5, unit_family: 'count', same_as: null, aliases: [] },
        { name: 'b', category: 'produce', family: 'vegetables', picto: 'tomato', default_zone: 'fridge', shelf_life_days: -3, unit_family: 'count', same_as: ' Tomato ', aliases: [] },
      ],
    });
    expect(out.has('a')).toBe(false);
    expect(out.get('b')?.shelf_life_days).toBeNull();
    expect(out.get('b')?.same_as).toBe('Tomato');
  });

  it('survives junk', () => {
    expect(normalizeTidy(null).size).toBe(0);
    expect(normalizeTidy({ items: 'no' }).size).toBe(0);
  });

  it('is not tied to one country', () => {
    expect(tidySystemPrompt(['Tomato'])).not.toMatch(/Mexic/i);
  });
});

describe('toStepStarts', () => {
  it('keeps one whole second per step, in order', () => {
    expect(toStepStarts([0, 12.7, null, 95], 4, 4)).toEqual([0, 12, null, 95]);
  });
  it('drops starts that go back in time, miss steps, or come with dropped steps', () => {
    expect(toStepStarts([30, 10], 2, 2)).toBeNull();
    expect(toStepStarts([0, 10], 3, 3)).toBeNull();
    expect(toStepStarts([0, 10, 20], 4, 3)).toBeNull();
    expect(toStepStarts([null, null], 2, 2)).toBeNull();
    expect(toStepStarts(undefined, 2, 2)).toBeNull();
  });
});

describe('runTidy', () => {
  const answer = (name: string, over: Record<string, unknown> = {}) => ({
    name, category: 'produce', family: 'vegetables', picto: 'leafy', default_zone: 'fridge', shelf_life_days: 5, unit_family: 'count', same_as: null, aliases: [], ...over,
  });
  const catalog = buildCatalog([{ id: 'p-hib', household_id: null, name_en: 'Hibiscus flower', category: 'cupboard', default_zone: 'cupboard', shelf_life_days: null, is_staple: false, unit_family: 'mass' }], []);
  const product = (i: number) => ({ id: `p${i}`, name_en: `Thing ${i}`, category: 'other', shelf_life_days: null });

  function kitchen(over: { products?: unknown[]; lines?: unknown[]; queued?: unknown[]; left?: unknown[]; stamp?: unknown } = {}) {
    return fakeDb((c: Call) => {
      const limit = c.filters.find((f) => f[0] === 'limit')?.[1];
      if (c.table === 'products' && c.op === 'select') return limit === 1 ? (over.left ?? []) : (over.products ?? []);
      if (c.table === 'grocery_items' && c.op === 'select') return limit === 1 ? [] : (over.lines ?? []);
      if (c.table === 'import_jobs' && c.op === 'select') return over.queued ?? [];
      if (c.op === 'update' && (c.payload as Record<string, unknown>).tidy_asked_at) return over.stamp ?? null;
      return null;
    });
  }
  const run = (db: Parameters<typeof fakeDeps>[0], ask: () => Promise<unknown>) => {
    const deps = fakeDeps(db, ask, catalog);
    return runTidy(deps, fakeJob({ kind: 'tidy', input_text: 'everything waiting' }), silent, new AbortController().signal).then((r) => ({ r, deps }));
  };
  const stamps = (calls: Call[]) => calls.filter((c) => c.op === 'update' && (c.payload as Record<string, unknown>).tidy_asked_at).map((c) => [c.table, c.filters]);

  it('asks once for every product and line waiting, and marks each one asked, answered or not', async () => {
    const { db, calls } = kitchen({
      products: [{ id: 'p1', name_en: 'Huauzontle', category: 'other', shelf_life_days: null }, { id: 'p2', name_en: 'Mystery', category: 'other', shelf_life_days: null }],
      lines: [{ id: 'l1', label: 'Flor de jamaica' }, { id: 'l2', label: 'huauzontle' }],
    });
    const { r, deps } = await run(db, async () => ({ items: [answer('Huauzontle'), answer('Flor de jamaica', { same_as: 'Hibiscus flower', category: 'cupboard' })] }));
    expect(r).toEqual({ products: 1, lines: 2 });
    expect(deps.ai.askJson).toHaveBeenCalledTimes(1);
    const asked = (vi.mocked(deps.ai.askJson).mock.calls[0]![0] as { parts: { text: string }[] }).parts[0]!.text;
    expect(asked).toBe('1. Huauzontle\n2. Mystery\n3. Flor de jamaica\n4. huauzontle');

    // Everything waiting is read in the household, never asked again.
    for (const table of ['products', 'grocery_items']) {
      expect(calls.find((c) => c.table === table && c.op === 'select')!.filters).toEqual(expect.arrayContaining([['eq', 'household_id', 'h1'], ['is', 'tidy_asked_at', null], ['limit', 25]]));
    }
    const lineUpdates = calls.filter((c) => c.table === 'grocery_items' && c.op === 'update' && !(c.payload as Record<string, unknown>).tidy_asked_at);
    expect(lineUpdates.map((c) => c.payload)).toEqual([{ category: 'cupboard', product_id: 'p-hib' }, { category: 'produce' }]);
    expect(lineUpdates[0]!.filters).toEqual(expect.arrayContaining([['eq', 'household_id', 'h1'], ['eq', 'category', 'other']]));
    expect(stamps(calls)).toEqual([
      ['products', [['in', 'id', ['p1', 'p2']], ['eq', 'household_id', 'h1']]],
      ['grocery_items', [['in', 'id', ['l1', 'l2']], ['eq', 'household_id', 'h1']]],
    ]);
    // Not a full batch: nothing left behind, no other tidy.
    expect(calls.some((c) => c.table === 'import_jobs')).toBe(false);
  });

  it('marks nothing when the model fails: all of it is asked again next time', async () => {
    const { db, calls } = kitchen({ products: [product(1)] });
    await expect(run(db, async () => { throw new Error('503'); })).rejects.toThrow('503');
    expect(stamps(calls)).toEqual([]);
  });

  it('queues one more tidy when a full batch leaves more waiting, unless one is queued already', async () => {
    const full = Array.from({ length: 25 }, (_, i) => product(i));
    const more = kitchen({ products: full, left: [{ id: 'p99' }] });
    await run(more.db, async () => ({ items: [] }));
    expect(more.calls.find((c) => c.table === 'import_jobs' && c.op === 'insert')!.payload).toEqual({ household_id: 'h1', kind: 'tidy', input_text: 'everything waiting' });

    const waitingAlready = kitchen({ products: full, left: [{ id: 'p99' }], queued: [{ id: 'job-2' }] });
    await run(waitingAlready.db, async () => ({ items: [] }));
    expect(waitingAlready.calls.some((c) => c.table === 'import_jobs' && c.op === 'insert')).toBe(false);

    const allDone = kitchen({ products: full });
    await run(allDone.db, async () => ({ items: [] }));
    expect(allDone.calls.some((c) => c.table === 'import_jobs' && c.op === 'insert')).toBe(false);
  });

  it('fails when what was asked cannot be marked', async () => {
    const { db } = kitchen({ products: [product(1)], stamp: new FakeDbError('08006', 'connection reset') });
    await expect(run(db, async () => ({ items: [] }))).rejects.toThrow('tidy products asked: connection reset');
  });
});
