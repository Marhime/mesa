import type { ImportJob } from '@mesa/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { claimJob } from '../src/job-store';
import type { LogFields, Logger } from '../src/log';
import { runSlot } from '../src/slot';
import { listenForNewJobs, WakeBell, type RealtimeDb } from '../src/wake';
import { fakeJob, silent } from './fake-deps';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function recordingLog() {
  const events: Array<{ msg: string; fields?: LogFields }> = [];
  const push = (msg: string, fields?: LogFields): void => void events.push({ msg, fields });
  const logger: Logger = { debug: push, info: push, warn: push, error: push, child: () => logger };
  return { logger, names: () => events.map((e) => e.msg), events };
}

describe('WakeBell', () => {
  it('ends a wait early when it rings, or after the time, or at shutdown', async () => {
    const bell = new WakeBell();
    const stop = new AbortController();
    const woken = bell.wait(3000, stop.signal);
    await vi.advanceTimersByTimeAsync(100);
    bell.ring();
    expect(await woken).toBe('woken');

    const timedOut = bell.wait(3000, stop.signal);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await timedOut).toBe('timeout');

    const stopped = bell.wait(3000, stop.signal);
    stop.abort();
    expect(await stopped).toBe('stopped');
    expect(await bell.wait(3000, stop.signal)).toBe('stopped');
  });

  it('does not miss a ring that came before the wait (during the claim)', async () => {
    const bell = new WakeBell();
    const ticket = bell.ticket();
    bell.ring();
    expect(await bell.wait(3000, new AbortController().signal, ticket)).toBe('woken');
  });
});

describe('runSlot', () => {
  const slot = (claims: Array<ImportJob | null | Error | (() => null)>, bell = new WakeBell()) => {
    const stop = new AbortController();
    const claimed: number[] = [];
    const ran: string[] = [];
    const claim = vi.fn(async () => {
      claimed.push(Date.now());
      const next = claims.shift() ?? null;
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next() : next;
    });
    const done = runSlot({ claim, run: async (job) => void ran.push(job.id), bell, pollMs: 3000, stopping: stop.signal, log: silent });
    return { stop, claim, claimed, ran, done, bell };
  };

  it('claims again at once when a new job wakes it, instead of waiting for the poll', async () => {
    const start = Date.now();
    const s = slot([null, fakeJob({ id: 'ask-1', kind: 'ask' })]);
    await vi.advanceTimersByTimeAsync(200);
    expect(s.claim).toHaveBeenCalledTimes(1);
    s.bell.ring();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.ran).toEqual(['ask-1']);
    expect(s.claimed[1]! - start).toBe(200);
    s.stop.abort();
    await s.done;
  });

  it('rests after the server work, unless a job comes in', async () => {
    const stop = new AbortController();
    const bell = new WakeBell();
    const claims: Array<ImportJob | null> = [
      fakeJob({ id: 'reread-1', kind: 'reread', created_by: null }),
      fakeJob({ id: 'reread-2', kind: 'reread', created_by: null }),
      fakeJob({ id: 'mine', kind: 'recipe', created_by: 'u1' }),
    ];
    const ran: Array<[string, number]> = [];
    const start = Date.now();
    const done = runSlot({
      claim: async () => claims.shift() ?? null,
      run: async (job) => void ran.push([job.id, Date.now() - start]),
      bell,
      pollMs: 3000,
      stopping: stop.signal,
      log: silent,
      pauseAfter: (job) => (job.created_by === null ? 30_000 : 0),
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(ran).toEqual([['reread-1', 0]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(ran.map(([id]) => id)).toEqual(['reread-1', 'reread-2']);
    // A person's job comes in during the rest: claimed at once.
    await vi.advanceTimersByTimeAsync(500);
    bell.ring();
    await vi.advanceTimersByTimeAsync(0);
    expect(ran[2]).toEqual(['mine', 30_500]);
    stop.abort();
    await done;
  });

  it('still polls without a wake', async () => {
    const s = slot([null, null, fakeJob({ id: 'j' })]);
    await vi.advanceTimersByTimeAsync(5999);
    expect(s.claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.ran).toEqual(['j']);
    s.stop.abort();
    await s.done;
  });

  it('a wake during the claim is not lost', async () => {
    const bell = new WakeBell();
    const ringing = (): null => {
      bell.ring();
      return null;
    };
    const s = slot([ringing], bell);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.claim).toHaveBeenCalledTimes(2);
    s.stop.abort();
    await s.done;
  });

  it('stops at once on shutdown while it waits, and claims nothing more', async () => {
    const s = slot([null]);
    await vi.advanceTimersByTimeAsync(10);
    s.stop.abort();
    await s.done;
    s.bell.ring();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.claim).toHaveBeenCalledTimes(1);
  });

  it('backs off when the queue does not answer, and a wake does not shorten it', async () => {
    const s = slot([new Error('db down'), new Error('db down'), null]);
    await vi.advanceTimersByTimeAsync(10);
    s.bell.ring();
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(s.claim).toHaveBeenCalledTimes(3);
    s.stop.abort();
    await s.done;
  });
});

describe('claimJob', () => {
  const db = (data: unknown, error: { message: string } | null = null) => {
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({ data, error }));
    return { rpc, client: { rpc } as unknown as Pick<SupabaseClient, 'rpc'> };
  };

  it('asks the queue for its lane: quick slots take only quick kinds, the others any (quick first)', async () => {
    const quick = db([fakeJob({ id: 'ask-1', kind: 'ask' })]);
    expect((await claimJob(quick.client, 'quick'))?.id).toBe('ask-1');
    expect(quick.rpc).toHaveBeenCalledWith('claim_import_job', { p_lane: 'quick' });

    const any = db([]);
    expect(await claimJob(any.client)).toBeNull();
    expect(any.rpc).toHaveBeenCalledWith('claim_import_job', { p_lane: 'any' });
  });

  it('throws when the queue refuses', async () => {
    await expect(claimJob(db(null, { message: 'unknown lane: slow' }).client, 'quick')).rejects.toThrow(/claim_import_job: unknown lane/);
  });
});

describe('listenForNewJobs', () => {
  type Status = (status: string, err?: Error) => void;
  function fakeRealtime(opts: { throwOnSubscribe?: boolean } = {}) {
    const channels: Array<{ name: string; filter?: unknown; insert?: () => void; report?: Status }> = [];
    const db = {
      channel: vi.fn((name: string) => {
        const ch: (typeof channels)[number] & { on: unknown; subscribe: unknown } = {
          name,
          on: (_type: string, filter: unknown, cb: () => void) => ((ch.filter = filter), (ch.insert = cb), ch),
          subscribe: (cb: Status) => {
            if (opts.throwOnSubscribe) throw new Error('WebSocket not available');
            ch.report = cb;
            return ch;
          },
        };
        channels.push(ch);
        return ch;
      }),
      removeChannel: vi.fn(async () => 'ok'),
    };
    return { db: db as unknown as RealtimeDb & typeof db, channels };
  }

  it('wakes on every INSERT into import_jobs', () => {
    const { db, channels } = fakeRealtime();
    const onJob = vi.fn();
    listenForNewJobs(db, onJob, silent);
    expect(channels[0]!.filter).toEqual({ event: 'INSERT', schema: 'public', table: 'import_jobs' });
    channels[0]!.report!('SUBSCRIBED');
    channels[0]!.insert!();
    channels[0]!.insert!();
    expect(onJob).toHaveBeenCalledTimes(2);
  });

  it('logs channel trouble once per change and lets supabase-js rejoin; a closed channel is opened again later', async () => {
    const { db, channels } = fakeRealtime();
    const log = recordingLog();
    listenForNewJobs(db, () => undefined, log.logger, 30_000);
    const report = channels[0]!.report!;
    report('CHANNEL_ERROR', new Error('socket'));
    report('CHANNEL_ERROR', new Error('socket'));
    report('SUBSCRIBED');
    expect(log.names()).toEqual(['wake_channel_trouble', 'wake_listening']);
    expect(db.channel).toHaveBeenCalledTimes(1);

    report('CLOSED');
    await vi.advanceTimersByTimeAsync(0);
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(db.channel).toHaveBeenCalledTimes(2);
    expect(channels[1]!.name).not.toBe(channels[0]!.name);
    // The old channel's late news is ignored.
    report('CHANNEL_ERROR');
    channels[1]!.report!('SUBSCRIBED');
    expect(log.names()).toEqual(['wake_channel_trouble', 'wake_listening', 'wake_channel_trouble', 'wake_listening']);
  });

  it('never throws when Realtime cannot start: polling only', async () => {
    const { db } = fakeRealtime({ throwOnSubscribe: true });
    const log = recordingLog();
    const jobs = listenForNewJobs(db, () => undefined, log.logger);
    expect(log.names()).toEqual(['wake_unavailable']);
    await expect(jobs.close()).resolves.toBeUndefined();
  });

  it('close removes the channel and opens no other one', async () => {
    const { db, channels } = fakeRealtime();
    const jobs = listenForNewJobs(db, () => undefined, silent, 1000);
    await jobs.close();
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    channels[0]!.report!('CLOSED');
    await vi.advanceTimersByTimeAsync(5000);
    expect(db.channel).toHaveBeenCalledTimes(1);
  });

  it('close does not hang on a channel that never answers', async () => {
    const { db } = fakeRealtime();
    db.removeChannel.mockImplementation(() => new Promise(() => undefined));
    const jobs = listenForNewJobs(db, () => undefined, silent);
    let closed = false;
    void jobs.close().then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(2000);
    expect(closed).toBe(true);
  });
});
