// The day's AI ceiling: counted per UTC day across workers (ai_usage), checked before every model call,
// never retried nor handed to another model, kept as the job's code whatever its kind; and one request's
// paid tries capped (an unreadable answer is tried again once).
import { ApiError } from '@google/genai';
import { IMPORT_KINDS } from '@mesa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { DailyAiBudget, supabaseUsageStore, type AiBudget, type DayTotals, type UsageStore } from '../src/ai-budget';
import { ImportError } from '../src/errors';
import { RecipeAI, type GeminiClient } from '../src/gemini';
import type { LogFields, Logger } from '../src/log';
import { ModelChain } from '../src/model-chain';
import { ModelOutputError } from '../src/model-output';
import { MAX_PAID_TRIES, RequestTries } from '../src/request-tries';
import { failureCode } from '../src/runner';
import { fakeDb } from './fake-deps';

function recordingLog() {
  const events: Array<{ msg: string; fields?: LogFields }> = [];
  const push = (msg: string, fields?: LogFields): void => void events.push({ msg, fields });
  const logger: Logger = { debug: push, info: push, warn: push, error: push, child: () => logger };
  return { logger, names: () => events.map((e) => e.msg) };
}

const day = (d: string, calls: number, input = 0, output = 0): DayTotals => ({ day: d, calls, input_tokens: input, output_tokens: output });

function memoryStore(start: DayTotals | null = null) {
  const added: unknown[] = [];
  let row = start;
  const store: UsageStore = {
    today: async () => row,
    add: async (usage) => {
      added.push(usage);
      row = row ? { ...row, calls: row.calls + 1, input_tokens: row.input_tokens + usage.inputTokens, output_tokens: row.output_tokens + usage.outputTokens } : null;
      return row;
    },
  };
  return { store, added };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('DailyAiBudget', () => {
  it('says no once the day has had its calls, said once a day, and starts again the next UTC day', async () => {
    let now = new Date('2026-11-07T23:59:00Z');
    const log = recordingLog();
    const budget = new DailyAiBudget(memoryStore().store, { tokens: 1_000_000, calls: 2 }, log.logger, () => now);
    budget.check();
    budget.record({ inputTokens: 10, outputTokens: 5 });
    budget.record({ inputTokens: 10, outputTokens: 5 });
    expect(() => budget.check()).toThrow(ImportError);
    expect(() => budget.check()).toThrow(expect.objectContaining({ code: 'aiDailyLimit' }));
    expect(log.names().filter((n) => n === 'ai_budget_reached')).toHaveLength(1);

    now = new Date('2026-11-08T00:00:01Z');
    expect(() => budget.check()).not.toThrow();
  });

  it('counts input and output tokens together', () => {
    const budget = new DailyAiBudget(memoryStore().store, { tokens: 100, calls: 1000 }, recordingLog().logger);
    budget.record({ inputTokens: 60, outputTokens: 39 });
    expect(() => budget.check()).not.toThrow();
    budget.record({ inputTokens: 0, outputTokens: 1 });
    expect(() => budget.check()).toThrow(expect.objectContaining({ code: 'aiDailyLimit' }));
  });

  it("starts from the day's totals in the database, and every worker's calls count", async () => {
    const now = () => new Date('2026-11-07T12:00:00Z');
    const { store, added } = memoryStore(day('2026-11-07', 9, 500, 500));
    const budget = new DailyAiBudget(store, { tokens: 1_000_000, calls: 12 }, recordingLog().logger, now);
    await budget.load();
    budget.record({ inputTokens: 7, outputTokens: 3 });
    await flush();
    expect(added).toEqual([{ inputTokens: 7, outputTokens: 3 }]);
    // Another worker made 2 calls meanwhile: the database's answer says so.
    store.add = async () => day('2026-11-07', 12, 600, 600);
    budget.record({ inputTokens: 1, outputTokens: 1 });
    await flush();
    expect(() => budget.check()).toThrow(expect.objectContaining({ code: 'aiDailyLimit' }));
  });

  it('counts by itself when the database is out of reach', async () => {
    const down = () => Promise.reject(new Error('fetch failed'));
    const log = recordingLog();
    const budget = new DailyAiBudget({ today: down, add: down }, { tokens: 1_000_000, calls: 2 }, log.logger);
    await budget.load();
    budget.record({ inputTokens: 1, outputTokens: 1 });
    budget.record({ inputTokens: 1, outputTokens: 1 });
    await flush();
    expect(log.names()).toContain('ai_usage_failed');
    expect(() => budget.check()).toThrow(expect.objectContaining({ code: 'aiDailyLimit' }));
  });
});

describe('supabaseUsageStore', () => {
  it("adds one call's tokens and reads the day back", async () => {
    const { db, calls } = fakeDb((c) => (c.op === 'rpc' ? { day: '2026-11-07', calls: 3, input_tokens: '1200', output_tokens: 300 } : null));
    const store = supabaseUsageStore(db as unknown as SupabaseClient);
    expect(await store.add({ inputTokens: 1000, outputTokens: 250 })).toEqual(day('2026-11-07', 3, 1200, 300));
    expect(calls[0]).toMatchObject({ table: 'record_ai_usage', payload: { p_calls: 1, p_input_tokens: 1000, p_output_tokens: 250 } });
    await store.today('2026-11-07');
    expect(calls[1]).toMatchObject({ table: 'ai_usage', filters: expect.arrayContaining([['eq', 'day', '2026-11-07']]) });
  });
});

const ANSWER = (text: string) => ({ text, candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 50 } });
const NAMES = JSON.stringify({ items: [{ i: 0, name_en: 'onion', category: 'produce', is_optional: false }] });

function fakeGemini(script: Record<string, unknown[]>) {
  const calls: string[] = [];
  const client = {
    models: {
      generateContent: vi.fn(async ({ model }: { model: string }) => {
        calls.push(model);
        const next = script[model]?.shift();
        if (next instanceof Error) throw next;
        return next ?? ANSWER(NAMES);
      }),
    },
    files: { upload: vi.fn() },
  } as unknown as GeminiClient;
  return { client, calls };
}

const spy = (): AiBudget & { recorded: unknown[] } => {
  const recorded: unknown[] = [];
  return { recorded, check: () => undefined, record: (u) => void recorded.push(u) };
};
const LINES = [{ i: 0, line: '1 cebolla' }];

describe('RecipeAI and the budget', () => {
  it('asks no model at all once the day is over its ceiling: no retry, no other model, no upload', async () => {
    const { client, calls } = fakeGemini({});
    const closed: AiBudget = { check: () => { throw new ImportError('aiDailyLimit'); }, record: vi.fn() };
    const ai = new RecipeAI(client, new ModelChain(['primary', 'backup']), recordingLog().logger, closed);
    await expect(ai.translateNames(LINES, [])).rejects.toMatchObject({ code: 'aiDailyLimit' });
    await expect(ai.askJson({ parts: [{ text: 'x' }], systemInstruction: 's', schema: { type: 'object' } }, 'tidy')).rejects.toMatchObject({ code: 'aiDailyLimit' });
    await expect(ai.uploadFile('/tmp/clip.mp4', 'video/mp4')).rejects.toMatchObject({ code: 'aiDailyLimit' });
    expect(calls).toEqual([]);
    expect(client.files.upload).not.toHaveBeenCalled();
  });

  it('records every answered call, thinking counted as output, an unreadable one too; a busy one is free', async () => {
    vi.useFakeTimers();
    try {
      const busy = new ApiError({ message: 'overloaded', status: 503 });
      const { client, calls } = fakeGemini({ primary: [busy], backup: [ANSWER('not json at all'), ANSWER(NAMES)] });
      const budget = spy();
      const ai = new RecipeAI(client, new ModelChain(['primary', 'backup']), recordingLog().logger, budget);
      const names = ai.translateNames(LINES, []);
      await vi.runAllTimersAsync();
      expect((await names).get(0)?.name_en).toBe('onion');
      expect(calls).toEqual(['primary', 'backup', 'backup']);
      expect(budget.recorded).toEqual([{ inputTokens: 1000, outputTokens: 250 }, { inputTokens: 1000, outputTokens: 250 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tries an unreadable answer again only once per request', async () => {
    vi.useFakeTimers();
    try {
      const { client, calls } = fakeGemini({ only: [ANSWER('nope'), ANSWER('still nope'), ANSWER(NAMES)] });
      const ai = new RecipeAI(client, new ModelChain(['only']), recordingLog().logger, spy());
      const names = ai.translateNames(LINES, []).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      expect(await names).toMatchObject({ code: 'aiFailed' });
      expect(calls).toEqual(['only', 'only']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RequestTries', () => {
  it(`allows ${MAX_PAID_TRIES} paid tries per request, and one retry after an unreadable answer`, () => {
    const tries = new RequestTries();
    const unreadable = new ModelOutputError('model response is not valid JSON');
    tries.answered();
    expect(tries.mayRetry(unreadable)).toBe(true);
    tries.answered();
    expect(tries.mayRetry(unreadable)).toBe(false);
    expect(tries.mayRetry(new Error('socket hang up'))).toBe(true);
    tries.answered();
    expect(tries.spent).toBe(true);
    expect(tries.mayRetry(new Error('socket hang up'))).toBe(false);
  });
});

describe('failureCode', () => {
  it('keeps aiDailyLimit for every kind, like aiBusy: the way out is to wait', () => {
    for (const kind of IMPORT_KINDS) {
      expect(failureCode(kind, new ImportError('aiDailyLimit'), false), kind).toBe('aiDailyLimit');
      expect(failureCode(kind, new ImportError('aiBusy'), false), kind).toBe('aiBusy');
    }
  });
});
