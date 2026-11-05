// Structured one-line JSON logs: {"ts":"…","level":"info","msg":"job_done","job":"…",…}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const MAX_STRING = 2000;

/** Errors become {name, message, status, code}; long strings are cut so a line stays readable. */
export function serializeValue(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    const out: Record<string, unknown> = { name: value.name, message: truncate(value.message) };
    const extra = value as Error & { status?: unknown; code?: unknown; cause?: unknown };
    if (typeof extra.status === 'number') out.status = extra.status;
    if (typeof extra.code === 'string' || typeof extra.code === 'number') out.code = extra.code;
    if (extra.cause !== undefined && depth < 2) out.cause = serializeValue(extra.cause, depth + 1);
    return out;
  }
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function truncate(s: string): string {
  return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
}

function emit(level: LogLevel, msg: string, bound: LogFields, fields: LogFields | undefined): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const record: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
  for (const [k, v] of Object.entries(bound)) record[k] = serializeValue(v);
  if (fields) for (const [k, v] of Object.entries(fields)) record[k] = serializeValue(v);
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({ ts: record.ts, level, msg, note: 'unserializable fields' });
  }
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
}

function makeLogger(bound: LogFields): Logger {
  return {
    debug: (msg, fields) => emit('debug', msg, bound, fields),
    info: (msg, fields) => emit('info', msg, bound, fields),
    warn: (msg, fields) => emit('warn', msg, bound, fields),
    error: (msg, fields) => emit('error', msg, bound, fields),
    child: (fields) => makeLogger({ ...bound, ...fields }),
  };
}

export const log: Logger = makeLogger({});
