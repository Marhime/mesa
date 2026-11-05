import { ApiError } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportError, MESSAGES } from '../src/errors';
import { RecipeAI, type GeminiClient } from '../src/gemini';
import { modelProblem } from '../src/gemini-errors';
import type { LogFields, Logger } from '../src/log';
import { ModelChain } from '../src/model-chain';

const busy = (status = 503): ApiError => new ApiError({ message: `{"error":{"code":${status},"status":"UNAVAILABLE"}}`, status });
const retired = (model: string): ApiError =>
  new ApiError({ message: `{"error":{"code":404,"message":"This model models/${model} is no longer available."}}`, status: 404 });
const abortError = (): Error => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

const TRANSLATION = { text: JSON.stringify({ items: [{ i: 0, name_en: 'Onion', category: 'produce', is_optional: false }] }), candidates: [{ finishReason: 'STOP' }] };

/** Each model answers from its own script, in order; an exhausted script answers TRANSLATION. */
function fakeGemini(script: Record<string, unknown[]>, known: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const client = {
    models: {
      generateContent: vi.fn(async ({ model }: { model: string }) => {
        calls.push(model);
        const next = script[model]?.shift();
        if (next instanceof Error) throw next;
        return next ?? TRANSLATION;
      }),
      get: vi.fn(async ({ model }: { model: string }) => {
        const err = known[model];
        if (err instanceof Error) throw err;
        return { name: `models/${model}` };
      }),
    },
    files: {},
  } as unknown as GeminiClient;
  return { client, calls };
}

function recordingLog() {
  const events: Array<{ msg: string; fields?: LogFields }> = [];
  const push = (msg: string, fields?: LogFields): void => void events.push({ msg, fields });
  const logger: Logger = { debug: push, info: push, warn: push, error: push, child: () => logger };
  return { logger, events, names: () => events.map((e) => e.msg) };
}

const LINES = [{ i: 0, line: '1 cebolla' }];

afterEach(() => {
  vi.useRealTimers();
});

describe('ModelChain', () => {
  it('puts a busy model last until its cooldown ends, and drops retired ones', () => {
    let now = 0;
    const chain = new ModelChain(['a', 'b', 'a', ' ', 'c'], () => now, 1000);
    expect(chain.order()).toEqual(['a', 'b', 'c']);
    chain.markBusy('a');
    expect(chain.order()).toEqual(['b', 'c', 'a']);
    now = 1001;
    expect(chain.order()).toEqual(['a', 'b', 'c']);
    chain.markBusy('b');
    chain.markHealthy('b');
    chain.drop('c');
    expect(chain.order()).toEqual(['a', 'b']);
  });
});

describe('modelProblem', () => {
  it('tells model trouble from request trouble', () => {
    expect(modelProblem(busy(503), 'm')).toBe('busy');
    expect(modelProblem(busy(504), 'm')).toBe('busy');
    expect(modelProblem(busy(429), 'm')).toBe('busy');
    expect(modelProblem(retired('m'), 'm')).toBe('gone');
    // A private YouTube video is a 404 that has nothing to do with the model.
    expect(modelProblem(new ApiError({ message: 'Requested entity was not found.', status: 404 }), 'm')).toBeNull();
    expect(modelProblem(new ApiError({ message: 'bad request', status: 400 }), 'm')).toBeNull();
    expect(modelProblem(abortError(), 'm')).toBe('busy');
    const jobAborted = AbortSignal.abort();
    expect(modelProblem(abortError(), 'm', jobAborted)).toBeNull();
  });
});

describe('RecipeAI model fallback', () => {
  it('moves to the next model at once when the first is overloaded, then starts with it while the first cools down', async () => {
    const { client, calls } = fakeGemini({ primary: [busy(503)] });
    const log = recordingLog();
    const ai = new RecipeAI(client, new ModelChain(['primary', 'backup']), log.logger);

    const first = await ai.translateNames(LINES, []);
    expect(first.get(0)?.name_en).toBe('onion');
    expect(calls).toEqual(['primary', 'backup']);
    expect(log.names()).toContain('gemini_fallback');
    expect(log.names()).not.toContain('retrying');

    await ai.translateNames(LINES, []);
    expect(calls).toEqual(['primary', 'backup', 'backup']);
  });

  it('drops a retired model and keeps going', async () => {
    const { client, calls } = fakeGemini({ old: [retired('old')] });
    const log = recordingLog();
    const chain = new ModelChain(['old', 'current']);
    const ai = new RecipeAI(client, chain, log.logger);

    await ai.translateNames(LINES, []);
    expect(calls).toEqual(['old', 'current']);
    expect(chain.all).toEqual(['current']);
    expect(log.names()).toContain('gemini_model_unavailable');
  });

  it('retries the last model with backoff, then reports "busy" to the person', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeGemini({ primary: [busy(503)], backup: [busy(503), busy(503), busy(503)] });
    const ai = new RecipeAI(client, new ModelChain(['primary', 'backup']), recordingLog().logger);

    const result = ai.extractRecipe([{ text: 'recipe' }], []);
    const assertion = expect(result).rejects.toMatchObject({ userMessage: MESSAGES.aiBusy });
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls).toEqual(['primary', 'backup', 'backup', 'backup']);
  });

  it('passes request errors through untouched, so a refused YouTube URL can still be downloaded', async () => {
    const notFound = new ApiError({ message: 'Requested entity was not found.', status: 404 });
    const { client, calls } = fakeGemini({ primary: [notFound] });
    const ai = new RecipeAI(client, new ModelChain(['primary', 'backup']), recordingLog().logger);

    await expect(ai.extractRecipe([{ text: 'recipe' }], [])).rejects.toBe(notFound);
    expect(calls).toEqual(['primary']);
  });

  it('says the reader failed when the only model is retired', async () => {
    const { client } = fakeGemini({ old: [retired('old')] });
    const ai = new RecipeAI(client, new ModelChain(['old']), recordingLog().logger);

    const err = await ai.extractRecipe([{ text: 'recipe' }], []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).userMessage).toBe(MESSAGES.aiFailed);
  });

  it('drops unknown model names at startup but keeps models it could not check', async () => {
    const { client } = fakeGemini({}, { typo: new ApiError({ message: 'Model is not found: models/typo', status: 404 }), flaky: new TypeError('fetch failed') });
    const log = recordingLog();
    const ai = new RecipeAI(client, new ModelChain(['main', 'typo', 'flaky']), log.logger);

    expect(await ai.checkModels()).toEqual(['main', 'flaky']);
    expect(log.names()).toEqual(expect.arrayContaining(['gemini_model_unavailable', 'gemini_model_check_failed']));
  });
});
