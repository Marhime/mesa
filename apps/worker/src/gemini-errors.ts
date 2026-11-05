// How a Gemini failure is handled: try again, move on to another model, or tell the person.
import { ApiError } from '@google/genai';
import { ImportError, isAbortError, MESSAGES } from './errors';
import { ModelOutputError } from './model-output';

/** 408/429/5xx, network failures and unreadable JSON are worth another try. */
export function isTransient(err: unknown): boolean {
  if (err instanceof ModelOutputError) return true;
  if (err instanceof ApiError) return err.status === 408 || err.status === 429 || err.status >= 500;
  if (isAbortError(err)) return false;
  if (err instanceof Error) {
    const code = (err as Error & { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
    if (typeof code === 'string' && /^(?:ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|EPIPE|UND_ERR_\w+)$/.test(code)) return true;
    return err.name === 'TypeError' && /fetch failed|network/i.test(err.message);
  }
  return false;
}

/** Wait after failed try number `attempt`: longer for rate limits, doubling each time, with jitter. */
export function retryDelayMs(err: unknown, attempt: number): number {
  const base = err instanceof ApiError && err.status === 429 ? 15_000 : 3_000;
  return base * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000);
}

/** busy: rate limit, overload, server deadline or request timeout. gone: the model is retired or unknown. */
export type ModelProblem = 'busy' | 'gone';

const BUSY_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Failures that come from the model rather than from the request, so another model may succeed. */
export function modelProblem(err: unknown, model: string, signal?: AbortSignal): ModelProblem | null {
  if (signal?.aborted) return null;
  if (err instanceof ApiError) {
    if (BUSY_STATUSES.has(err.status)) return 'busy';
    // A missing YouTube video is a 404 too: only the model's own name means the model is gone.
    if (err.status === 404 && err.message.includes(`models/${model}`)) return 'gone';
    return null;
  }
  // The SDK's per-request timeout aborts the call while the job's own signal is still live.
  return isAbortError(err) ? 'busy' : null;
}

/** The last model failed too: the message the person sees. */
export function exhaustedError(err: unknown, model: string, problem: ModelProblem): ImportError {
  if (problem === 'gone') return new ImportError(MESSAGES.aiFailed, { cause: err, detail: `gemini model ${model} unavailable` });
  const status = err instanceof ApiError ? `gemini ${err.status}` : 'gemini timeout';
  return new ImportError(MESSAGES.aiBusy, { cause: err, detail: `${status} (${model})` });
}

/** Any other Gemini failure as the message the person sees. */
export function modelErrorToImportError(err: unknown): unknown {
  if (err instanceof ImportError || isAbortError(err)) return err;
  if (err instanceof ApiError) {
    if (BUSY_STATUSES.has(err.status) && err.status !== 500) return new ImportError(MESSAGES.aiBusy, { cause: err, detail: `gemini ${err.status}` });
    if (err.status >= 500) return new ImportError(MESSAGES.aiFailed, { cause: err, detail: `gemini ${err.status}` });
  }
  if (err instanceof ModelOutputError) return new ImportError(MESSAGES.aiFailed, { cause: err, detail: err.message });
  return err;
}
