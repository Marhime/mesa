// The model as the jobs see it, whoever provides it (gemini.ts today). Requests are provider-neutral:
// parts (text, inline bytes, a file or a link the model can open) and a ModelSchema. One error contract
// for every method: it rejects with an ImportError, whose code says what the person sees (aiBusy, aiFailed,
// aiBlocked, timeout…), or with an abort error when the job's signal fired. ModelRefusedError is the one
// ImportError a caller may want to tell apart: the model would not take this input (another way in may).
import { ImportError } from './errors';
import type { ModelOutcome, Translation } from './model-output';
import type { ModelSchema } from './model-schema';

/** One piece of a request: exactly one of these is set. */
export interface ModelPart {
  text?: string;
  /** Bytes sent with the request (base64). */
  inlineData?: { mimeType: string; data: string };
  /** An uploaded file (uploadFile) or a link the model opens itself (a YouTube video). */
  fileData?: { fileUri: string; mimeType?: string };
}

/** How much the model thinks before it answers: less, and the first words come sooner. */
export type Thinking = 'minimal' | 'low' | 'medium' | 'high';

export interface JsonRequest {
  parts: ModelPart[];
  systemInstruction: string;
  schema: ModelSchema;
  /** Unset: the model's own default. */
  thinking?: Thinking;
  /**
   * Set: the call is streamed, and this hears the text so far (the JSON being written) after each piece;
   * '' when a try failed, since the next one (or the next model) starts over.
   */
  onText?: (soFar: string) => void;
}

export interface UploadedFile {
  name: string;
  uri: string;
  mimeType: string;
}

/** Any structured answer (ideas, plans, questions, scans, tidying…). */
export interface JsonModel {
  askJson(request: JsonRequest, what: string, signal?: AbortSignal): Promise<unknown>;
}

/** Recipes: a full extraction from media and/or text, and English names for ingredient lines. */
export interface RecipeModel {
  extractRecipe(parts: ModelPart[], knownProducts: readonly string[], signal?: AbortSignal): Promise<ModelOutcome>;
  /** English name + category for lines, keyed by the given index. */
  translateNames(lines: ReadonlyArray<{ i: number; line: string }>, knownProducts: readonly string[], signal?: AbortSignal): Promise<Map<number, Translation>>;
}

/** Videos the model watches from its own storage. */
export interface FileModel {
  /** Resolves once the model can read the file. */
  uploadFile(path: string, mimeType: string, signal?: AbortSignal): Promise<UploadedFile>;
  /** Best effort: never throws. */
  deleteFile(name: string): Promise<void>;
}

export type ModelPort = JsonModel & RecipeModel & FileModel;

/** The model refused this input (a client error other than a rate limit). Stored as 'unknown', as before. */
export class ModelRefusedError extends ImportError {
  constructor(options: { cause?: unknown; detail?: string }) {
    super('unknown', options);
    this.name = 'ModelRefusedError';
  }
}

export const isModelRefused = (err: unknown): err is ModelRefusedError => err instanceof ModelRefusedError;
