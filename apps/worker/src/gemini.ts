// The model port (model-port.ts) on Gemini: full extraction, batched name translation, any structured
// answer, and video uploads through the Files API. A request may ask for less thinking, or be streamed
// (Ask Mesa shows its answer as it is written). Every method keeps the port's error contract. Every call
// is checked against the day's AI budget first (ai-budget.ts) and recorded in it once answered; one
// request's paid tries are capped (request-tries.ts).
import {
  ApiError,
  FileState,
  ThinkingLevel,
  Type as GeminiType,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  type GoogleGenAI,
  type Schema,
} from '@google/genai';
import type { AiBudget, AiUsage } from './ai-budget';
import { ImportError } from './errors';
import { exhaustedError, isTransient, modelErrorToImportError, modelProblem, refusesThinking, retryDelayMs } from './gemini-errors';
import type { Logger } from './log';
import type { ModelChain } from './model-chain';
import type { JsonRequest, ModelPart, ModelPort, Thinking, UploadedFile } from './model-port';
import type { ModelSchema, SchemaType } from './model-schema';
import {
  type ModelOutcome,
  normalizeModelOutput,
  normalizeTranslations,
  parseModelJson,
  RECIPE_RESPONSE_SCHEMA,
  TRANSLATION_RESPONSE_SCHEMA,
  type Translation,
} from './model-output';
import { recipeSystemPrompt, translationSystemPrompt, translationUserPrompt } from './prompts';
import { RequestTries } from './request-tries';
import { sleep, withRetry } from './retry';

const REQUEST_TIMEOUT_MS = 240_000;
const FILE_ACTIVE_TIMEOUT_MS = 180_000;
const FILE_POLL_MS = 2_000;
/** Tries on a model before moving to the next one; the last model left gets a few more. */
const ATTEMPTS_PER_MODEL = 2;
const ATTEMPTS_LAST_MODEL = 3;

/** The part of the Gemini SDK the worker uses (a fake in tests). */
export type GeminiClient = Pick<GoogleGenAI, 'models' | 'files'>;

const THINKING_LEVEL: Record<Thinking, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export type { JsonRequest, Thinking, UploadedFile } from './model-port';

const GEMINI_TYPE: Record<SchemaType, GeminiType> = {
  object: GeminiType.OBJECT,
  array: GeminiType.ARRAY,
  string: GeminiType.STRING,
  integer: GeminiType.INTEGER,
  number: GeminiType.NUMBER,
  boolean: GeminiType.BOOLEAN,
};

/** A ModelSchema in Gemini's own terms (its OpenAPI subset). */
export function geminiSchema(s: ModelSchema): Schema {
  const { type, properties, items, ...rest } = s;
  return {
    ...rest,
    type: GEMINI_TYPE[type],
    ...(properties ? { properties: Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, geminiSchema(v)])) } : {}),
    ...(items ? { items: geminiSchema(items) } : {}),
  };
}

/** One call's answer, streamed or not. */
interface Answer {
  text: string | undefined;
  finish: string | undefined;
  blocked: string | undefined;
  usage: GenerateContentResponseUsageMetadata | undefined;
  /** Streamed: when the first text came. */
  firstTextMs?: number;
}

/** What an answered call spent: the prompt in, the answer and its thinking out. */
const usageOf = (usage: GenerateContentResponseUsageMetadata | undefined): AiUsage => ({
  inputTokens: usage?.promptTokenCount ?? 0,
  outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
});

const whole = (res: GenerateContentResponse): Answer => ({
  text: res.text,
  finish: res.candidates?.[0]?.finishReason,
  blocked: res.promptFeedback?.blockReason,
  usage: res.usageMetadata,
});

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

export class RecipeAI implements ModelPort {
  /** Models that refused the thinking option: asked without it from then on. */
  private readonly noThinking = new Set<string>();

  constructor(
    private readonly ai: GeminiClient,
    private readonly chain: ModelChain,
    private readonly log: Logger,
    private readonly budget: AiBudget,
  ) {}

  /**
   * Startup: drops model names Gemini doesn't know (typos). A retired model still answers here but
   * fails on use; generateJson drops it then. Returns the models left.
   */
  async checkModels(): Promise<readonly string[]> {
    await Promise.all(
      this.chain.all.map(async (model) => {
        try {
          await this.ai.models.get({ model });
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            this.chain.drop(model);
            this.log.error('gemini_model_unavailable', { model, err });
          } else {
            this.log.warn('gemini_model_check_failed', { model, err });
          }
        }
      }),
    );
    return this.chain.all;
  }

  /**
   * One JSON answer, from the first model that can give it. A busy or retired model hands over to the
   * next one at once; the last model left is retried with backoff; no try once the request's paid ones are
   * used up. The day's ceiling (aiDailyLimit) is never retried and never handed to another model.
   */
  private async generateJson(request: JsonRequest, signal: AbortSignal | undefined, what: string): Promise<unknown> {
    const order = this.chain.order();
    if (order.length === 0) throw new ImportError('aiFailed', { detail: 'no gemini model available' });
    const tries = new RequestTries();
    for (const [i, model] of order.entries()) {
      const last = i === order.length - 1;
      try {
        const json = await withRetry(() => this.callModel(model, request, signal, what, tries), {
          signal,
          log: this.log,
          what,
          fields: { model },
          attempts: last ? ATTEMPTS_LAST_MODEL : ATTEMPTS_PER_MODEL,
          retryable: (err) => isTransient(err) && (last || modelProblem(err, model, signal) === null) && tries.mayRetry(err),
          delayMs: retryDelayMs,
        });
        this.chain.markHealthy(model);
        return json;
      } catch (err) {
        const problem = modelProblem(err, model, signal);
        if (problem === null) throw err;
        if (problem === 'gone') {
          this.chain.drop(model);
          this.log.error('gemini_model_unavailable', { model, err });
        } else {
          this.chain.markBusy(model);
        }
        if (last || tries.spent) throw exhaustedError(err, model, problem);
        this.log.warn('gemini_fallback', { what, from: model, to: order[i + 1], reason: problem, err });
      }
    }
    throw new Error('unreachable: the model loop always returns or throws');
  }

  /** One try on one model. A model that refuses the thinking option is asked again at once without it. */
  private async callModel(model: string, request: JsonRequest, signal: AbortSignal | undefined, what: string, tries: RequestTries): Promise<unknown> {
    const thinking = request.thinking !== undefined && !this.noThinking.has(model) ? request.thinking : undefined;
    try {
      return await this.callOnce(model, request, thinking, signal, what, tries);
    } catch (err) {
      if (thinking === undefined || !refusesThinking(err)) throw err;
      this.noThinking.add(model);
      this.log.warn('gemini_thinking_refused', { what, model, thinking, err });
      return this.callOnce(model, request, undefined, signal, what, tries);
    }
  }

  private async callOnce(
    model: string,
    request: JsonRequest,
    thinking: Thinking | undefined,
    signal: AbortSignal | undefined,
    what: string,
    tries: RequestTries,
  ): Promise<unknown> {
    this.budget.check();
    const started = Date.now();
    const params: GenerateContentParameters = {
      model,
      contents: [{ role: 'user', parts: request.parts }],
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: geminiSchema(request.schema),
        temperature: 0.1,
        ...(thinking ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL[thinking] } } : {}),
        abortSignal: signal,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    };
    const onText = request.onText;
    try {
      const res = onText ? await this.streamed(params, onText, started) : whole(await this.ai.models.generateContent(params));
      // Answered: paid for, whatever comes of it (blocked, unreadable).
      tries.answered();
      this.budget.record(usageOf(res.usage));
      this.log.info('gemini_call', {
        what,
        model,
        ms: Date.now() - started,
        ...(onText ? { stream: true, first_text_ms: res.firstTextMs } : {}),
        ...(thinking ? { thinking } : {}),
        finish: res.finish,
        prompt_tokens: res.usage?.promptTokenCount,
        output_tokens: res.usage?.candidatesTokenCount,
        thoughts_tokens: res.usage?.thoughtsTokenCount,
      });
      if (res.blocked) throw new ImportError('aiBlocked', { detail: `blocked: ${res.blocked}` });
      if (res.finish && BLOCKED_FINISH.has(res.finish)) throw new ImportError('aiBlocked', { detail: `finish: ${res.finish}` });
      return parseModelJson(res.text);
    } catch (err) {
      if (onText) this.hear(onText, '');
      throw err;
    }
  }

  /** The streamed answer, gathered; onText hears the text so far after each piece. */
  private async streamed(params: GenerateContentParameters, onText: (soFar: string) => void, started: number): Promise<Answer> {
    const stream = await this.ai.models.generateContentStream(params);
    const res: Answer = { text: undefined, finish: undefined, blocked: undefined, usage: undefined };
    for await (const chunk of stream) {
      res.blocked ??= chunk.promptFeedback?.blockReason;
      res.finish = chunk.candidates?.[0]?.finishReason ?? res.finish;
      res.usage = chunk.usageMetadata ?? res.usage;
      const piece = chunk.text;
      if (!piece) continue;
      res.firstTextMs ??= Date.now() - started;
      res.text = (res.text ?? '') + piece;
      this.hear(onText, res.text);
    }
    return res;
  }

  /** What the listener does with the text never fails the call. */
  private hear(onText: (soFar: string) => void, text: string): void {
    try {
      onText(text);
    } catch (err) {
      this.log.warn('gemini_on_text_failed', { err });
    }
  }

  /** Any structured answer (sweeps, receipts); failures come back as the message the person sees. */
  async askJson(request: JsonRequest, what: string, signal?: AbortSignal): Promise<unknown> {
    try {
      return await this.generateJson(request, signal, what);
    } catch (err) {
      throw modelErrorToImportError(err);
    }
  }

  /** Full extraction from media and/or text parts. */
  async extractRecipe(parts: ModelPart[], knownProducts: readonly string[], signal?: AbortSignal): Promise<ModelOutcome> {
    try {
      const json = await this.generateJson({ parts, systemInstruction: recipeSystemPrompt(knownProducts), schema: RECIPE_RESPONSE_SCHEMA }, signal, 'extract');
      return normalizeModelOutput(json);
    } catch (err) {
      throw modelErrorToImportError(err);
    }
  }

  /** English name + category for JSON-LD ingredient lines, keyed by the given index. */
  async translateNames(
    lines: ReadonlyArray<{ i: number; line: string }>,
    knownProducts: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<number, Translation>> {
    if (lines.length === 0) return new Map();
    try {
      const json = await this.generateJson(
        { parts: [{ text: translationUserPrompt(lines) }], systemInstruction: translationSystemPrompt(knownProducts), schema: TRANSLATION_RESPONSE_SCHEMA },
        signal,
        'translate',
      );
      return normalizeTranslations(json);
    } catch (err) {
      throw modelErrorToImportError(err);
    }
  }

  /** Uploads a local video and waits until Gemini has processed it (state ACTIVE). */
  async uploadFile(path: string, mimeType: string, signal?: AbortSignal): Promise<UploadedFile> {
    try {
      return await this.upload(path, mimeType, signal);
    } catch (err) {
      throw modelErrorToImportError(err);
    }
  }

  private async upload(path: string, mimeType: string, signal?: AbortSignal): Promise<UploadedFile> {
    // A video uploaded past the day's ceiling could not be watched anyway.
    this.budget.check();
    const started = Date.now();
    const retry = { signal, log: this.log, attempts: 2, retryable: isTransient, delayMs: retryDelayMs };
    let file = await withRetry(() => this.ai.files.upload({ file: path, config: { mimeType, abortSignal: signal } }), { ...retry, what: 'upload' });
    if (!file.name) throw new ImportError('aiFailed', { detail: 'gemini upload returned no file name' });
    const name = file.name;
    try {
      while (file.state === FileState.PROCESSING || file.state === undefined || file.state === FileState.STATE_UNSPECIFIED) {
        if (Date.now() - started > FILE_ACTIVE_TIMEOUT_MS) throw new ImportError('timeout', { detail: 'gemini file processing' });
        await sleep(FILE_POLL_MS, signal);
        file = await withRetry(() => this.ai.files.get({ name, config: { abortSignal: signal } }), { ...retry, what: 'file_status' });
      }
      if (file.state !== FileState.ACTIVE || !file.uri) {
        throw new ImportError('videoFailed', { detail: `gemini file state ${file.state ?? 'unknown'}: ${file.error?.message ?? ''}` });
      }
    } catch (err) {
      await this.deleteFile(name);
      throw err;
    }
    this.log.info('gemini_file_active', { file: name, ms: Date.now() - started, bytes: file.sizeBytes });
    return { name, uri: file.uri, mimeType: file.mimeType ?? mimeType };
  }

  /** Best effort: uploaded files also expire on their own after 48 hours. */
  async deleteFile(name: string): Promise<void> {
    try {
      await this.ai.files.delete({ name });
    } catch (err) {
      this.log.warn('gemini_file_delete_failed', { file: name, err });
    }
  }
}
