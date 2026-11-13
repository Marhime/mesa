import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { answerAsWritten } from '../src/ask-mesa';
import { draftAnswer } from '../src/ask-output';
import { DRAFT_EVERY_MS, jobDraft } from '../src/draft';
import type { LogFields, Logger } from '../src/log';
import { fakeDb, silent } from './fake-deps';

const drafts = (calls: ReturnType<typeof fakeDb>['calls']) =>
  calls.filter((c) => c.op === 'update').map((c) => (c.payload as { draft: string | null }).draft);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('jobDraft', () => {
  it('writes at once, then at most every 350 ms with the latest text, only while the job runs', async () => {
    const { db, calls } = fakeDb(() => null);
    const draft = jobDraft(db, 'job-1', silent);
    draft.write('Una');
    draft.write('Una tor');
    draft.write('Una tortilla');
    await vi.advanceTimersByTimeAsync(0);
    expect(drafts(calls)).toEqual(['Una']);
    expect(calls[0]!.filters).toEqual([
      ['eq', 'id', 'job-1'],
      ['eq', 'status', 'processing'],
    ]);
    await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS - 1);
    expect(drafts(calls)).toEqual(['Una']);
    await vi.advanceTimersByTimeAsync(1);
    expect(drafts(calls)).toEqual(['Una', 'Una tortilla']);
    // Nothing new: nothing written.
    draft.write('Una tortilla');
    await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS * 3);
    expect(drafts(calls)).toHaveLength(2);
    await draft.close();
  });

  it('flush writes what waits at once; "" clears the draft (a try starting over)', async () => {
    const { db, calls } = fakeDb(() => null);
    const draft = jobDraft(db, 'job-1', silent);
    draft.write('Hello');
    draft.write('Hello world.');
    draft.flush();
    draft.write('');
    await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS);
    expect(drafts(calls)).toEqual(['Hello', 'Hello world.', null]);
    await draft.close();
  });

  it('close drops what waits and writes nothing more', async () => {
    const { db, calls } = fakeDb(() => null);
    const draft = jobDraft(db, 'job-1', silent);
    draft.write('A');
    draft.write('AB');
    await draft.close();
    draft.write('ABC');
    draft.flush();
    await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS * 2);
    expect(drafts(calls)).toEqual(['A']);
  });

  it('a failing write is logged once and never throws; later writes still go', async () => {
    const events: string[] = [];
    const log: Logger = { ...silent, warn: (msg: string, _f?: LogFields) => void events.push(msg) };
    let n = 0;
    const update = vi.fn(() => {
      n++;
      if (n === 1) throw new Error('network down');
      const result = { error: n === 2 ? { message: 'boom' } : null };
      const builder = { eq: () => builder, then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) };
      return builder;
    });
    const db = { from: () => ({ update }) } as unknown as SupabaseClient;
    const draft = jobDraft(db, 'job-1', log);
    for (const text of ['a', 'ab', 'abc']) {
      draft.write(text);
      await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS);
    }
    await draft.close();
    expect(update).toHaveBeenCalledTimes(3);
    expect(events).toEqual(['draft_write_failed']);
  });

  it('close does not wait long for a write that hangs', async () => {
    const hanging = { eq: () => hanging, then: () => undefined };
    const db = { from: () => ({ update: () => hanging }) } as unknown as SupabaseClient;
    const draft = jobDraft(db, 'job-1', silent);
    draft.write('stuck');
    let closed = false;
    void draft.close().then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(2000);
    expect(closed).toBe(true);
  });
});

describe('answerAsWritten', () => {
  it('writes the answer read from the JSON so far, shaped like the stored one, and flushes when it is complete', async () => {
    const { db, calls } = fakeDb(() => null);
    const draft = jobDraft(db, 'job-1', silent);
    const onText = answerAsWritten(draft);
    onText('{"on_topic": true, ');
    onText('{"on_topic": true, "answer": "  Una\\ntortilla');
    onText('{"on_topic": true, "answer": "  Una\\ntortilla de espi');
    onText('{"on_topic": true, "answer": "  Una\\ntortilla de espinacas.", "recipes": [');
    onText('{"on_topic": true, "answer": "  Una\\ntortilla de espinacas.", "recipes": [], "actions": []}');
    await draft.close();
    expect(drafts(calls)).toEqual(['Una tortilla', 'Una tortilla de espinacas.']);
  });

  it('clears the draft when a try starts over', async () => {
    const { db, calls } = fakeDb(() => null);
    const draft = jobDraft(db, 'job-1', silent);
    const onText = answerAsWritten(draft);
    onText('{"answer": "First try');
    onText('');
    await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS);
    onText('{"answer": "Second');
    await vi.advanceTimersByTimeAsync(DRAFT_EVERY_MS);
    await draft.close();
    expect(drafts(calls)).toEqual(['First try', null, 'Second']);
  });
});

describe('draftAnswer', () => {
  it('collapses spaces and keeps to 80 words and 700 characters, without half an emoji', () => {
    expect(draftAnswer('\n  Tu as  du riz\n\net des œufs ')).toBe('Tu as du riz et des œufs ');
    expect(draftAnswer('word '.repeat(120)).split(' ')).toHaveLength(80);
    expect(draftAnswer('x'.repeat(900))).toHaveLength(700);
    expect(draftAnswer('Bon appétit \ud83c')).toBe('Bon appétit ');
  });
});
