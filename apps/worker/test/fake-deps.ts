// Stand-ins shared by the job tests: a recording supabase-js, a silent logger, pipeline deps, a job.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJob } from '@mesa/shared';
import { vi } from 'vitest';

import type { AiBudget } from '../src/ai-budget';
import { ImportError } from '../src/errors';
import type { Catalog } from '../src/mapping';
import type { Logger } from '../src/log';
import type { PipelineDeps } from '../src/pipeline';
import type { ImportDeps } from '../src/ports';

export interface Call {
  /** The table, or the function for an rpc. */
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  /** What was written, or the rpc's arguments. */
  payload?: unknown;
  /** upsert's options (onConflict…). */
  options?: unknown;
  filters: unknown[][];
}

/** An answer that is a database error ({ data: null, error }). */
export class FakeDbError {
  constructor(readonly code: string, readonly message = `error ${code}`) {}
}

/** A job end matched its row (job-store.ts fences them) unless the test says otherwise. */
const defaultAnswer = (call: Call): unknown => (call.table === 'import_jobs' && call.op === 'update' ? [{ id: 'matched' }] : null);

/** A chainable stand-in for supabase-js: every query (and rpc) is recorded and answered by `answer`. */
export function fakeDb(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const builderFor = (call: Call) => {
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, ...args]);
      return builder;
    };
    for (const name of ['select', 'eq', 'not', 'in', 'is', 'or', 'order', 'limit', 'maybeSingle', 'single', 'ilike']) builder[name] = chain(name);
    builder.insert = (payload: unknown) => ((call.op = 'insert'), (call.payload = payload), builder);
    builder.update = (payload: unknown) => ((call.op = 'update'), (call.payload = payload), builder);
    builder.upsert = (payload: unknown, options?: unknown) => ((call.op = 'upsert'), (call.payload = payload), (call.options = options), builder);
    builder.delete = () => ((call.op = 'delete'), builder);
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const data = answer(call) ?? defaultAnswer(call);
      const result = data instanceof FakeDbError ? { data: null, error: { code: data.code, message: data.message } } : { data, error: null };
      return Promise.resolve(result).then(resolve, reject);
    };
    return builder;
  };
  const from = (table: string) => builderFor({ table, op: 'select', filters: [] });
  const rpc = (fn: string, args?: unknown) => builderFor({ table: fn, op: 'rpc', payload: args, filters: [] });
  return { db: { from, rpc } as unknown as SupabaseClient, calls };
}

/** A budget that never says no and keeps nothing (gemini.ts's own tests). */
export const noBudget: AiBudget = { check: () => undefined, record: () => undefined };

export const silent: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => silent };

/** The worker's deps, and an import's share of them (ImportDeps: yt-dlp options). */
export type FakeDeps = PipelineDeps & ImportDeps;

export function fakeDeps(db: SupabaseClient, askJson: (...args: unknown[]) => Promise<unknown>, catalog: Catalog | null = null): FakeDeps {
  return {
    db,
    ai: { askJson: vi.fn(askJson) },
    catalog: { forHousehold: async () => catalog },
    config: { expoAccessToken: null, ytdlpPath: 'yt-dlp-not-run-in-tests', ytdlpCookies: null },
    ytdlp: { path: 'yt-dlp-not-run-in-tests', cookies: null },
    media: { read: async () => { throw new ImportError('imageMissing', { detail: 'no media in this test' }); } },
  } as unknown as FakeDeps;
}

export const fakeJob = (over: Partial<ImportJob>): ImportJob =>
  ({ id: 'job-1', household_id: 'h1', kind: 'idea', input_url: null, input_text: null, input_image_path: null, attempts: 1, created_by: 'u1', created_at: new Date().toISOString(), ...over }) as ImportJob;

/** The last update written on the job. */
export const jobUpdate = (calls: Call[]) => calls.filter((c) => c.table === 'import_jobs' && c.op === 'update').at(-1)?.payload as Record<string, unknown>;
