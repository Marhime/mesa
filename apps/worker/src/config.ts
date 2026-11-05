// Environment configuration, validated once at startup with readable errors.
import type { LogLevel } from './log';

export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  geminiApiKey: string;
  geminiModel: string;
  /** Tried in order when geminiModel is busy or retired. */
  geminiFallbackModels: string[];
  pollIntervalMs: number;
  ytdlpPath: string;
  /** cookies.txt (Netscape format) passed to yt-dlp, mainly for Instagram. */
  ytdlpCookies: string | null;
  concurrency: number;
  logLevel: LogLevel;
  /** Only needed when "Enhanced push security" is on in the Expo project. */
  expoAccessToken: string | null;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /YOUR[-_]|^<.*>$|^changeme$/i;

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
/** Older generations: less demand when the newest model is overloaded. "none" turns fallbacks off. */
export const DEFAULT_GEMINI_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash'];

/** Reads and validates the worker's environment. Throws ConfigError listing every problem. */
export function loadConfig(env: Env): Config {
  const problems: string[] = [];
  const value = (name: string): string | null => {
    const v = env[name]?.trim();
    return v === undefined || v === '' ? null : v;
  };
  const required = (name: string, hint: string): string => {
    const v = value(name);
    if (v === null) {
      problems.push(`${name} is required (${hint}).`);
      return '';
    }
    if (PLACEHOLDER.test(v)) problems.push(`${name} still has the placeholder value from .env.example.`);
    return v;
  };
  const integer = (name: string, def: number, min: number, max: number): number => {
    const v = value(name);
    if (v === null) return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be a whole number between ${min} and ${max} (got "${v}").`);
      return def;
    }
    return n;
  };

  let supabaseUrl = required('SUPABASE_URL', 'e.g. https://abcd1234.supabase.co');
  if (supabaseUrl !== '') {
    try {
      const u = new URL(supabaseUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
      supabaseUrl = supabaseUrl.replace(/\/+$/, '');
    } catch {
      problems.push(`SUPABASE_URL is not a valid http(s) URL (got "${supabaseUrl}").`);
    }
  }

  const supabaseServiceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', 'Supabase → Project settings → API keys → service_role / secret key');
  const keyProblem = serviceKeyProblem(supabaseServiceRoleKey);
  if (keyProblem) problems.push(keyProblem);

  const geminiApiKey = required('GEMINI_API_KEY', 'create one at https://aistudio.google.com/apikey');
  const geminiModel = value('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL;
  const geminiFallbackModels = fallbackModels(value('GEMINI_FALLBACK_MODELS'), geminiModel);
  const pollIntervalMs = integer('POLL_INTERVAL_MS', 3000, 250, 600_000);
  const ytdlpPath = value('YTDLP_PATH') ?? 'yt-dlp';
  const ytdlpCookies = value('YTDLP_COOKIES');
  const concurrency = integer('WORKER_CONCURRENCY', 1, 1, 8);

  const rawLevel = (value('LOG_LEVEL') ?? 'info').toLowerCase();
  let logLevel: LogLevel = 'info';
  if (rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error') {
    logLevel = rawLevel;
  } else {
    problems.push(`LOG_LEVEL must be one of debug, info, warn, error (got "${rawLevel}").`);
  }

  if (problems.length > 0) throw new ConfigError(problems);
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    geminiApiKey,
    geminiModel,
    geminiFallbackModels,
    pollIntervalMs,
    ytdlpPath,
    ytdlpCookies,
    concurrency,
    logLevel,
    expoAccessToken: value('EXPO_ACCESS_TOKEN'),
  };
}

/** "a, b" → ["a", "b"], without duplicates or the main model; unset → defaults; "none" → []. */
function fallbackModels(raw: string | null, main: string): string[] {
  if (raw !== null && raw.toLowerCase() === 'none') return [];
  const list = raw === null ? DEFAULT_GEMINI_FALLBACK_MODELS : raw.split(',').map((m) => m.trim());
  return [...new Set(list)].filter((m) => m !== '' && m !== main);
}

/** Catches the classic mistake of pasting the anon / publishable key instead of the service key. */
function serviceKeyProblem(key: string): string | null {
  if (key === '') return null;
  if (key.startsWith('sb_publishable_')) {
    return 'SUPABASE_SERVICE_ROLE_KEY is a publishable key; use the secret (service_role) key.';
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { role?: unknown };
      if (payload.role !== undefined && payload.role !== 'service_role') {
        return `SUPABASE_SERVICE_ROLE_KEY has role "${String(payload.role)}"; use the service_role key.`;
      }
    } catch {
      // not a JWT we can read; let Supabase decide
    }
  }
  return null;
}
