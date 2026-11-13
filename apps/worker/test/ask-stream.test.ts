// Ask Mesa as it is written: the job's draft follows the streamed answer, and is cleared when the job ends.
import { describe, expect, it, vi } from 'vitest';

import { MESSAGES } from '../src/errors';
import type { JsonRequest } from '../src/gemini';
import { processJob } from '../src/runner';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent, type Call } from './fake-deps';

const kitchen = (c: Call) => {
  if (c.table === 'recipes') return [{ id: 'omelette', title: 'Tortilla de espinacas', total_minutes: 15, servings: 2, is_favorite: false, last_cooked_at: null, recipe_ingredients: [] }];
  return c.op === 'select' ? [] : null;
};

const RAW = { on_topic: true, answer: 'Una tortilla de espinacas.', recipes: [{ recipe: 'R1', why: 'Rápida' }], actions: [] };
const TEXT = JSON.stringify(RAW);

async function ask(model: (request: JsonRequest) => Promise<unknown>) {
  const { db, calls } = fakeDb(kitchen);
  const deps = fakeDeps(db, (request) => model(request as JsonRequest));
  await processJob(deps, fakeJob({ kind: 'ask', input_text: '¿Qué hago con las espinacas?' }), silent, { shutdown: new AbortController().signal });
  const updates = calls.filter((c) => c.table === 'import_jobs' && c.op === 'update');
  return { deps, calls, updates, drafts: updates.filter((c) => 'draft' in (c.payload as object) && !('status' in (c.payload as object))) };
}

describe('Ask Mesa streamed', () => {
  it('asks with little thinking and streamed, and writes the answer as it comes before the checked result', async () => {
    const { deps, calls, updates, drafts } = await ask(async (request) => {
      for (let n = 10; n < TEXT.length; n += 10) request.onText?.(TEXT.slice(0, n));
      request.onText?.(TEXT);
      return RAW;
    });
    const request = vi.mocked(deps.ai.askJson).mock.calls[0]![0] as JsonRequest;
    expect(request.thinking).toBe('low');
    expect(typeof request.onText).toBe('function');
    // The first words at once, then the whole answer as soon as its closing quote came (no timer needed).
    expect(drafts.map((c) => (c.payload as { draft: string }).draft)).toEqual(['Una', 'Una tortilla de espinacas.']);
    expect(drafts.every((c) => c.filters.some((f) => f[1] === 'status' && f[2] === 'processing'))).toBe(true);
    // The checked answer last, and the draft cleared with it.
    expect(updates.at(-1)).toBe(calls.filter((c) => c.op === 'update').at(-1));
    expect(jobUpdate(calls)).toMatchObject({ status: 'done', draft: null, result: { answer: 'Una tortilla de espinacas.', recipes: [{ recipe_id: 'omelette' }] } });
  });

  it('clears the draft when the answer fails, after any draft written', async () => {
    const { updates } = await ask(async (request) => {
      request.onText?.('{"on_topic": true, "answer": "Una tor');
      throw new Error('stream broke');
    });
    expect(updates.map((c) => c.payload)).toEqual([
      { draft: 'Una tor' },
      expect.objectContaining({ status: 'failed', error: MESSAGES.askFailed, draft: null }),
    ]);
  });

  it('every other job end clears the draft too', async () => {
    const { db, calls } = fakeDb(kitchen);
    const deps = fakeDeps(db, async () => ({ ideas: [] }));
    await processJob(deps, fakeJob({ kind: 'idea', input_text: 'spinach', subject_id: 'p1' }), silent, { shutdown: new AbortController().signal });
    expect(jobUpdate(calls)).toMatchObject({ draft: null });
  });
});
