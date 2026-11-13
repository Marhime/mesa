import { ApiError } from '@google/genai';
import { Type } from '../src/model-schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGES } from '../src/errors';
import { RecipeAI, type GeminiClient, type JsonRequest } from '../src/gemini';
import type { LogFields, Logger } from '../src/log';
import { ModelChain } from '../src/model-chain';
import { noBudget } from './fake-deps';

const ANSWER = JSON.stringify({ on_topic: true, answer: 'Una tortilla.', recipes: [], actions: [] });
const pieces = (text: string, size = 7): string[] => Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size));

type Params = { model: string; config: Record<string, unknown> };
type Step = Error | { chunks: Array<Record<string, unknown> | Error> };

/** Each model answers from its own script: an error at the call, or a stream of chunks (an error mid-stream). */
function fakeGemini(script: Record<string, Step[]>) {
  const calls: Params[] = [];
  const next = (params: Params): Step => {
    calls.push(params);
    const step = script[params.model]?.shift();
    return step ?? { chunks: [...pieces(ANSWER).map((text) => ({ text })), { candidates: [{ finishReason: 'STOP' }], usageMetadata: { candidatesTokenCount: 9 } }] };
  };
  const client = {
    models: {
      generateContent: vi.fn(async (params: Params) => {
        const step = next(params);
        if (step instanceof Error) throw step;
        return { text: step.chunks.map((c) => (c as { text?: string }).text ?? '').join(''), candidates: [{ finishReason: 'STOP' }] };
      }),
      generateContentStream: vi.fn(async (params: Params) => {
        const step = next(params);
        if (step instanceof Error) throw step;
        return (async function* () {
          for (const chunk of step.chunks) {
            if (chunk instanceof Error) throw chunk;
            yield chunk;
          }
        })();
      }),
    },
    files: {},
  } as unknown as GeminiClient & { models: { generateContent: ReturnType<typeof vi.fn>; generateContentStream: ReturnType<typeof vi.fn> } };
  return { client, calls };
}

function recordingLog() {
  const events: Array<{ msg: string; fields?: LogFields }> = [];
  const push = (msg: string, fields?: LogFields): void => void events.push({ msg, fields });
  const logger: Logger = { debug: push, info: push, warn: push, error: push, child: () => logger };
  return { logger, events, names: () => events.map((e) => e.msg) };
}

const request = (over: Partial<JsonRequest> = {}): JsonRequest => ({
  parts: [{ text: 'q' }],
  systemInstruction: 's',
  schema: { type: Type.OBJECT, properties: { answer: { type: Type.STRING } } },
  ...over,
});

const busy = (): ApiError => new ApiError({ message: '{"error":{"code":503,"status":"UNAVAILABLE"}}', status: 503 });
const thinkingRefused = (): ApiError =>
  new ApiError({ message: '{"error":{"code":400,"message":"Thinking level is not supported for this model.","status":"INVALID_ARGUMENT"}}', status: 400 });

afterEach(() => {
  vi.useRealTimers();
});

describe('RecipeAI thinking option', () => {
  it('passes the thinking level when asked, and nothing otherwise', async () => {
    const { client, calls } = fakeGemini({});
    const ai = new RecipeAI(client, new ModelChain(['m']), recordingLog().logger, noBudget);
    await ai.askJson(request({ thinking: 'low' }), 'ask_mesa');
    await ai.askJson(request(), 'scan');
    expect(calls[0]!.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(calls[1]!.config).not.toHaveProperty('thinkingConfig');
  });

  it('a model that refuses it is asked again at once without it, and from then on', async () => {
    const { client, calls } = fakeGemini({ m: [thinkingRefused()] });
    const log = recordingLog();
    const ai = new RecipeAI(client, new ModelChain(['m', 'backup']), log.logger, noBudget);
    expect(await ai.askJson(request({ thinking: 'low' }), 'ask_mesa')).toMatchObject({ answer: 'Una tortilla.' });
    await ai.askJson(request({ thinking: 'low' }), 'ask_mesa');
    expect(calls.map((c) => [c.model, c.config.thinkingConfig ?? null])).toEqual([
      ['m', { thinkingLevel: 'LOW' }],
      ['m', null],
      ['m', null],
    ]);
    expect(log.names()).toContain('gemini_thinking_refused');
    expect(log.names()).not.toContain('gemini_fallback');
  });

  it('another bad request is not mistaken for it', async () => {
    const bad = new ApiError({ message: '{"error":{"code":400,"message":"Invalid schema."}}', status: 400 });
    const { client, calls } = fakeGemini({ m: [bad] });
    const ai = new RecipeAI(client, new ModelChain(['m']), recordingLog().logger, noBudget);
    await expect(ai.askJson(request({ thinking: 'low' }), 'ask_mesa')).rejects.toMatchObject({ name: 'ModelRefusedError', cause: bad });
    expect(calls).toHaveLength(1);
  });
});

describe('RecipeAI streamed answer', () => {
  it('streams when onText is set: hears the text so far after each piece and returns the parsed whole', async () => {
    const { client } = fakeGemini({});
    const log = recordingLog();
    const ai = new RecipeAI(client, new ModelChain(['m']), log.logger, noBudget);
    const heard: string[] = [];
    const json = await ai.askJson(request({ onText: (t) => heard.push(t) }), 'ask_mesa');
    expect(json).toEqual(JSON.parse(ANSWER));
    expect(client.models.generateContent).not.toHaveBeenCalled();
    expect(heard).toHaveLength(pieces(ANSWER).length);
    expect(heard.at(-1)).toBe(ANSWER);
    heard.forEach((t, i) => expect(ANSWER.startsWith(t) && (i === 0 || t.length > heard[i - 1]!.length)).toBe(true));
    const call = log.events.find((e) => e.msg === 'gemini_call')!.fields!;
    expect(call).toMatchObject({ stream: true, finish: 'STOP', output_tokens: 9 });
    expect(typeof call.first_text_ms).toBe('number');
  });

  it('does not stream without onText', async () => {
    const { client } = fakeGemini({});
    const ai = new RecipeAI(client, new ModelChain(['m']), recordingLog().logger, noBudget);
    await ai.askJson(request(), 'ask_mesa');
    expect(client.models.generateContentStream).not.toHaveBeenCalled();
  });

  it('starts over ("") when a stream breaks, then hears the next model from its first piece', async () => {
    const { client, calls } = fakeGemini({ m: [{ chunks: [{ text: '{"answer": "Half' }, busy()] }] });
    const ai = new RecipeAI(client, new ModelChain(['m', 'backup']), recordingLog().logger, noBudget);
    const heard: string[] = [];
    const json = await ai.askJson(request({ onText: (t) => heard.push(t) }), 'ask_mesa');
    expect(calls.map((c) => c.model)).toEqual(['m', 'backup']);
    expect(heard.slice(0, 3)).toEqual(['{"answer": "Half', '', pieces(ANSWER)[0]]);
    expect(json).toMatchObject({ answer: 'Una tortilla.' });
  });

  it('starts over when the streamed text is not JSON, and retries', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeGemini({ m: [{ chunks: [{ text: '{"answer": "cut' }] }] });
    const ai = new RecipeAI(client, new ModelChain(['m']), recordingLog().logger, noBudget);
    const heard: string[] = [];
    const result = ai.askJson(request({ onText: (t) => heard.push(t) }), 'ask_mesa');
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ answer: 'Una tortilla.' });
    expect(calls).toHaveLength(2);
    expect(heard[1]).toBe('');
  });

  it('a blocked prompt in the stream is said as blocked', async () => {
    const { client } = fakeGemini({ m: [{ chunks: [{ promptFeedback: { blockReason: 'SAFETY' } }] }] });
    const ai = new RecipeAI(client, new ModelChain(['m']), recordingLog().logger, noBudget);
    await expect(ai.askJson(request({ onText: () => undefined }), 'ask_mesa')).rejects.toMatchObject({ userMessage: MESSAGES.aiBlocked });
  });

  it('a listener that throws never fails the call', async () => {
    const { client } = fakeGemini({});
    const log = recordingLog();
    const ai = new RecipeAI(client, new ModelChain(['m']), log.logger, noBudget);
    const json = await ai.askJson(
      request({
        onText: () => {
          throw new Error('listener bug');
        },
      }),
      'ask_mesa',
    );
    expect(json).toMatchObject({ answer: 'Una tortilla.' });
    expect(log.names()).toContain('gemini_on_text_failed');
  });
});
