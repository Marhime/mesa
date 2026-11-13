// A ceiling on what the worker spends on AI in a day (UTC): model calls, and tokens in and out (thinking
// included). Once today's totals reach a limit, every model call is refused at once with aiDailyLimit
// ("try again tomorrow") until the day turns: nothing is retried, no other model is tried. The day's totals
// live in ai_usage (migration 28): read at startup, added to after each answered call (record_ai_usage),
// whose answer (the day so far, every worker's calls included) refreshes the totals here. When the
// database can't be read, the totals are this worker's own since it started.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ImportError } from './errors';
import type { Logger } from './log';

/** What one answered call spent. */
export interface AiUsage {
  inputTokens: number;
  /** The answer and the thinking before it. */
  outputTokens: number;
}

/** The day's spend, as the model adapter sees it (gemini.ts). */
export interface AiBudget {
  /** Throws ImportError('aiDailyLimit') once today's totals have reached a limit. */
  check(): void;
  /** One answered call: counted here at once, recorded in the background (never throws, never waits). */
  record(usage: AiUsage): void;
}

export interface AiLimits {
  /** Input and output tokens together. */
  tokens: number;
  calls: number;
}

/** A UTC day's totals, as ai_usage keeps them. */
export interface DayTotals {
  /** YYYY-MM-DD, UTC. */
  day: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

/** Where the day's totals are kept. Both reject on failure (with the database's error code when there is one). */
export interface UsageStore {
  today(day: string): Promise<DayTotals | null>;
  /** Adds one call's use; the day so far. */
  add(usage: AiUsage): Promise<DayTotals | null>;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
const nothingYet = (day: string): DayTotals => ({ day, calls: 0, input_tokens: 0, output_tokens: 0 });

/** A row of ai_usage (bigint columns may come as strings), or null for anything else. */
function totalsOf(data: unknown): DayTotals | null {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row.day !== 'string') return null;
  return { day: row.day.slice(0, 10), calls: Number(row.calls) || 0, input_tokens: Number(row.input_tokens) || 0, output_tokens: Number(row.output_tokens) || 0 };
}

const failure = (what: string, error: { code?: string; message: string }): Error =>
  Object.assign(new Error(`${what}: ${error.message}`), { code: error.code });

export function supabaseUsageStore(db: Pick<SupabaseClient, 'from' | 'rpc'>): UsageStore {
  return {
    async today(day) {
      const { data, error } = await db.from('ai_usage').select('day, calls, input_tokens, output_tokens').eq('day', day).maybeSingle();
      if (error) throw failure('ai_usage', error);
      return totalsOf(data);
    },
    async add(usage) {
      const { data, error } = await db.rpc('record_ai_usage', { p_calls: 1, p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens });
      if (error) throw failure('record_ai_usage', error);
      return totalsOf(data);
    },
  };
}

export class DailyAiBudget implements AiBudget {
  private totals: DayTotals;
  /** The day the ceiling was said to be reached (said once a day). */
  private reachedOn: string | null = null;

  constructor(
    private readonly store: UsageStore,
    private readonly limits: AiLimits,
    private readonly log: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.totals = nothingYet(dayOf(now()));
  }

  /** Today's totals so far (startup). Never throws: unknown means starting from this worker's own count. */
  async load(): Promise<void> {
    try {
      const today = await this.store.today(this.current().day);
      if (today) this.merge(today);
      this.log.info('ai_budget_loaded', { ...this.current(), limits: this.limits });
    } catch (err) {
      this.storeFailed(err);
    }
  }

  check(): void {
    const t = this.current();
    const tokens = t.input_tokens + t.output_tokens;
    if (t.calls < this.limits.calls && tokens < this.limits.tokens) return;
    if (this.reachedOn !== t.day) {
      this.reachedOn = t.day;
      this.log.warn('ai_budget_reached', { day: t.day, calls: t.calls, tokens, limits: this.limits });
    }
    throw new ImportError('aiDailyLimit', { detail: `${t.calls} calls and ${tokens} tokens today` });
  }

  record(usage: AiUsage): void {
    const t = this.current();
    t.calls += 1;
    t.input_tokens += Math.max(0, usage.inputTokens);
    t.output_tokens += Math.max(0, usage.outputTokens);
    this.store.add(usage).then(
      (row) => {
        if (row) this.merge(row);
      },
      (err: unknown) => this.storeFailed(err),
    );
  }

  /** The totals of the current day: a new day starts from nothing. */
  private current(): DayTotals {
    const day = dayOf(this.now());
    if (this.totals.day !== day) this.totals = nothingYet(day);
    return this.totals;
  }

  /** The database counts every worker; a call of this one may not be in its answer yet: the larger count wins. */
  private merge(row: DayTotals): void {
    const t = this.current();
    if (row.day !== t.day) return;
    t.calls = Math.max(t.calls, row.calls);
    t.input_tokens = Math.max(t.input_tokens, row.input_tokens);
    t.output_tokens = Math.max(t.output_tokens, row.output_tokens);
  }

  private storeFailed(err: unknown): void {
    this.log.warn('ai_usage_failed', { err });
  }
}
