// Gemini calls: full extraction, batched name translation, and video uploads through the Files API.
import { ApiError, FileState, type GoogleGenAI, type Part, type Schema } from '@google/genai';
import { ImportError, MESSAGES } from './errors';
import { exhaustedError, isTransient, modelErrorToImportError, modelProblem, retryDelayMs } from './gemini-errors';
import type { Logger } from './log';
import type { ModelChain } from './model-chain';
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
import { sleep, withRetry } from './retry';

const REQUEST_TIMEOUT_MS = 240_000;
const FILE_ACTIVE_TIMEOUT_MS = 180_000;
const FILE_POLL_MS = 2_000;
/** Tries on a model before moving to the next one; the last model left gets a few more. */
const ATTEMPTS_PER_MODEL = 2;
const ATTEMPTS_LAST_MODEL = 3;

/** The part of the Gemini SDK the worker uses (a fake in tests). */
export type GeminiClient = Pick<GoogleGenAI, 'models' | 'files'>;

export interface JsonRequest {
  parts: Part[];
  systemInstruction: string;
  schema: Schema;
}

export interface UploadedFile {
  name: string;
  uri: string;
  mimeType: string;
}

export class RecipeAI {
  constructor(
    private readonly ai: GeminiClient,
    private readonly chain: ModelChain,
    private readonly log: Logger,
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
   * next one at once; the last model left is retried with backoff.
   */
  private async generateJson(request: JsonRequest, signal: AbortSignal | undefined, what: string): Promise<unknown> {
    const order = this.chain.order();
    if (order.length === 0) throw new ImportError(MESSAGES.aiFailed, { detail: 'no gemini model available' });
    for (const [i, model] of order.entries()) {
      const last = i === order.length - 1;
      try {
        const json = await withRetry(() => this.callModel(model, request, signal, what), {
          signal,
          log: this.log,
          what,
          fields: { model },
          attempts: last ? ATTEMPTS_LAST_MODEL : ATTEMPTS_PER_MODEL,
          retryable: (err) => isTransient(err) && (last || modelProblem(err, model, signal) === null),
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
        if (last) throw exhaustedError(err, model, problem);
        this.log.warn('gemini_fallback', { what, from: model, to: order[i + 1], reason: problem, err });
      }
    }
    throw new Error('unreachable: the model loop always returns or throws');
  }

  private async callModel(model: string, request: JsonRequest, signal: AbortSignal | undefined, what: string): Promise<unknown> {
    const started = Date.now();
    const res = await this.ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: request.parts }],
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: request.schema,
        temperature: 0.1,
        abortSignal: signal,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    });
    const candidate = res.candidates?.[0];
    this.log.info('gemini_call', {
      what,
      model,
      ms: Date.now() - started,
      finish: candidate?.finishReason,
      prompt_tokens: res.usageMetadata?.promptTokenCount,
      output_tokens: res.usageMetadata?.candidatesTokenCount,
      thoughts_tokens: res.usageMetadata?.thoughtsTokenCount,
    });
    if (res.promptFeedback?.blockReason) {
      throw new ImportError(MESSAGES.aiBlocked, { detail: `blocked: ${res.promptFeedback.blockReason}` });
    }
    const finish = candidate?.finishReason;
    if (finish && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY'].includes(finish)) {
      throw new ImportError(MESSAGES.aiBlocked, { detail: `finish: ${finish}` });
    }
    return parseModelJson(res.text);
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
  async extractRecipe(parts: Part[], knownProducts: readonly string[], signal?: AbortSignal): Promise<ModelOutcome> {
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
    const json = await this.generateJson(
      { parts: [{ text: translationUserPrompt(lines) }], systemInstruction: translationSystemPrompt(knownProducts), schema: TRANSLATION_RESPONSE_SCHEMA },
      signal,
      'translate',
    );
    return normalizeTranslations(json);
  }

  /** Uploads a local video and waits until Gemini has processed it (state ACTIVE). */
  async uploadFile(path: string, mimeType: string, signal?: AbortSignal): Promise<UploadedFile> {
    const started = Date.now();
    const retry = { signal, log: this.log, attempts: 2, retryable: isTransient, delayMs: retryDelayMs };
    let file = await withRetry(() => this.ai.files.upload({ file: path, config: { mimeType, abortSignal: signal } }), { ...retry, what: 'upload' });
    if (!file.name) throw new Error('Gemini upload returned no file name');
    const name = file.name;
    try {
      while (file.state === FileState.PROCESSING || file.state === undefined || file.state === FileState.STATE_UNSPECIFIED) {
        if (Date.now() - started > FILE_ACTIVE_TIMEOUT_MS) throw new ImportError(MESSAGES.timeout, { detail: 'gemini file processing' });
        await sleep(FILE_POLL_MS, signal);
        file = await withRetry(() => this.ai.files.get({ name, config: { abortSignal: signal } }), { ...retry, what: 'file_status' });
      }
      if (file.state !== FileState.ACTIVE || !file.uri) {
        throw new ImportError(MESSAGES.videoFailed, { detail: `gemini file state ${file.state ?? 'unknown'}: ${file.error?.message ?? ''}` });
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
