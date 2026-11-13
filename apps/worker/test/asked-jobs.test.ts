// Idea and translate jobs end to end through processJob, with a fake database and model.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJob, Product } from '@mesa/shared';
import { describe, expect, it, vi } from 'vitest';

import { ImportError, MESSAGES } from '../src/errors';
import { processJob } from '../src/runner';
import { buildCatalog } from '../src/mapping';
import type { PipelineDeps } from '../src/pipeline';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

const product = (id: string, name_en: string): Product => ({
  id, household_id: null, name_en, category: 'produce', default_zone: 'fridge', shelf_life_days: 7, is_staple: false, unit_family: 'count',
});
const catalog = buildCatalog([product('tomato', 'Tomato'), product('egg', 'Egg'), product('spinach', 'Spinach')], []);

const deps = (db: SupabaseClient, askJson: (...args: unknown[]) => Promise<unknown>): PipelineDeps => fakeDeps(db, askJson, catalog);
const job = (over: Partial<ImportJob>): ImportJob => fakeJob(over);
const run = (d: PipelineDeps, j: ImportJob) => processJob(d, j, silent, { shutdown: new AbortController().signal });

describe('idea job', () => {
  it('writes ideas checked against what is at home, without a push', async () => {
    const { db, calls } = fakeDb((c) =>
      c.table === 'pantry_status'
        ? [
            { product_id: 'egg', name_en: 'Egg', expires_on: '2026-11-20' },
            { product_id: 'spinach', name_en: 'Spinach', expires_on: '2026-11-07' },
            { product_id: 'tomato', name_en: 'Tomato', expires_on: '2026-11-08' },
          ]
        : null,
    );
    const d = deps(db, async () => ({
      ideas: [{ title: 'Shakshuka', uses: ['tomato', 'eggs', 'bell pepper'], to_buy: ['spinach'], minutes: 25, why: 'Uses the tomatoes and spinach soon.' }],
    }));
    await run(d, job({ kind: 'idea', subject_id: 'tomato', input_text: 'Tomatoes' }));

    const prompt = (vi.mocked(d.ai.askJson).mock.calls[0]![0] as { parts: { text: string }[] }).parts[0]!.text;
    expect(prompt).toContain('Food to use: Tomatoes');
    expect(prompt.indexOf('Spinach')).toBeLessThan(prompt.indexOf('Egg'));
    expect(prompt).not.toContain('- Tomato');
    expect(calls.find((c) => c.table === 'pantry_status')!.filters).toContainEqual(['not', 'state', 'in', '("out","gone")']);

    expect(jobUpdate(calls)).toMatchObject({
      status: 'done',
      error: null,
      result: { food: 'Tomatoes', ideas: [{ title: 'Shakshuka', uses: ['Tomatoes', 'Egg', 'Spinach'], to_buy: ['bell pepper'], minutes: 25 }] },
    });
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });

  it('fails with its own message when the answer has no idea, and keeps "busy" when the model is', async () => {
    const empty = fakeDb(() => []);
    await run(deps(empty.db, async () => ({ ideas: [] })), job({ kind: 'idea', subject_id: 'tomato', input_text: 'tomato' }));
    expect(jobUpdate(empty.calls)).toMatchObject({ status: 'failed', error: MESSAGES.ideasFailed, error_code: 'ideasFailed' });

    const busy = fakeDb(() => []);
    await run(deps(busy.db, async () => { throw new ImportError('aiBusy'); }), job({ kind: 'idea', input_text: 'tomato' }));
    expect(jobUpdate(busy.calls)).toMatchObject({ status: 'failed', error_code: 'aiBusy' });
    expect(busy.calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });
});

describe('translate job', () => {
  const recipe = (cached: boolean) => (c: Call) => {
    if (c.table === 'recipe_translations' && c.op === 'select') return cached ? { recipe_id: 'r1' } : null;
    if (c.table === 'recipes') return { title: 'Pasta in 15 minutes' };
    if (c.table === 'recipe_steps') return [{ text: 'Boil 2 l of water.' }, { text: 'Cook 8 min.' }];
    return null;
  };

  it('stores the title and steps, keeping a step whose numbers changed', async () => {
    const { db, calls } = fakeDb(recipe(false));
    const d = deps(db, async () => ({ title: 'Pâtes en 15 minutes', steps: ['Faire bouillir 2 l d’eau.', 'Cuire huit minutes.'] }));
    await run(d, job({ kind: 'translate', subject_id: 'r1', input_text: 'fr' }));

    expect(calls.find((c) => c.table === 'recipe_steps')!.filters).toContainEqual(['order', 'position']);
    expect(calls.find((c) => c.table === 'recipes')!.filters).toContainEqual(['eq', 'household_id', 'h1']);
    expect(calls.find((c) => c.op === 'upsert')!.payload).toEqual({
      recipe_id: 'r1',
      lang: 'fr',
      title: 'Pâtes en 15 minutes',
      steps: ['Faire bouillir 2 l d’eau.', 'Cook 8 min.'],
    });
    expect(jobUpdate(calls)).toMatchObject({ status: 'done', error: null });
    expect(jobUpdate(calls)).not.toHaveProperty('result');
  });

  it('just finishes when the translation exists', async () => {
    const { db, calls } = fakeDb(recipe(true));
    const d = deps(db, async () => ({}));
    await run(d, job({ kind: 'translate', subject_id: 'r1', input_text: 'fr' }));
    expect(d.ai.askJson).not.toHaveBeenCalled();
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
    expect(jobUpdate(calls)).toMatchObject({ status: 'done' });
  });

  it('fails without writing when steps do not match one to one, or the language is not a code', async () => {
    const mismatch = fakeDb(recipe(false));
    await run(deps(mismatch.db, async () => ({ title: 'x', steps: ['one step'] })), job({ kind: 'translate', subject_id: 'r1', input_text: 'fr' }));
    expect(mismatch.calls.some((c) => c.op === 'upsert')).toBe(false);
    expect(jobUpdate(mismatch.calls)).toMatchObject({ status: 'failed', error: MESSAGES.translateFailed, error_code: 'translateFailed' });

    const badLang = fakeDb(recipe(false));
    await run(deps(badLang.db, async () => ({})), job({ kind: 'translate', subject_id: 'r1', input_text: 'French' }));
    expect(jobUpdate(badLang.calls)).toMatchObject({ status: 'failed', error_code: 'translateFailed' });
    expect(badLang.calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });
});
