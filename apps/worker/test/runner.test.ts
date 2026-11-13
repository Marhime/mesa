// The runner: one handler per registry kind, an unknown kind fails without a model call, every kind goes
// back to the queue on shutdown, and the failure code follows the kind's registry entry.
import { IMPORT_KINDS, type ImportJob } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { ImportError } from '../src/errors';
import { buildHandlers } from '../src/handlers';
import { failureCode, processJob } from '../src/runner';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent } from './fake-deps';

describe('handlers', () => {
  it('cover every kind of the registry, and only those', () => {
    const handlers = buildHandlers(fakeDeps(fakeDb(() => null).db, async () => ({})));
    expect(Object.keys(handlers).sort()).toEqual([...IMPORT_KINDS].sort());
  });
});

describe('processJob', () => {
  it('fails a kind it has no handler for, at once: no model call, no push', async () => {
    const { db, calls } = fakeDb(() => null);
    const d = fakeDeps(db, async () => ({}));
    await processJob(d, fakeJob({ kind: 'adapt' as ImportJob['kind'], subject_id: 'r1', input_text: 'no cream' }), silent, { shutdown: new AbortController().signal });
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error_code: 'unknownKind', platform: 'text' });
    expect(d.ai.askJson).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table !== 'import_jobs')).toBe(false);
  });

  it('puts background work back in the queue when the worker shuts down', async () => {
    const shutdown = new AbortController();
    const { db, calls } = fakeDb((c) => (c.table === 'products' ? [{ id: 'p1', name_en: 'Huauzontle', category: 'other', shelf_life_days: null }] : null));
    const d = fakeDeps(db, async () => {
      shutdown.abort(new DOMException('shutting down', 'AbortError'));
      throw shutdown.signal.reason;
    });
    await processJob(d, fakeJob({ kind: 'tidy', created_by: null, input_text: 'Huauzontle' }), silent, { shutdown: shutdown.signal });
    expect(jobUpdate(calls)).toEqual({ status: 'queued', started_at: null, stage: null, draft: null });
  });

  it('keeps the detail of a background failure, which nobody is shown', async () => {
    const { db, calls } = fakeDb((c) => (c.table === 'products' ? [{ id: 'p1', name_en: 'Huauzontle', category: 'other', shelf_life_days: null }] : null));
    const d = fakeDeps(db, async () => {
      throw new Error('socket hang up');
    });
    await processJob(d, fakeJob({ kind: 'tidy', created_by: null, input_text: 'Huauzontle' }), silent, { shutdown: new AbortController().signal });
    expect(jobUpdate(calls)).toMatchObject({ status: 'failed', error: 'socket hang up', error_code: 'unknown' });
    expect(calls.some((c) => c.table === 'push_tokens')).toBe(false);
  });
});

describe('failureCode', () => {
  const busy = new ImportError('aiBusy');
  it('keeps every code an import raises; a timeout is a timeout', () => {
    expect(failureCode('recipe', new ImportError('videoPrivate'), false)).toBe('videoPrivate');
    expect(failureCode('recipe', new Error('boom'), false)).toBe('unknown');
    expect(failureCode('sweep', busy, true)).toBe('timeout');
  });

  it('says an asked job failed in its own words, except a busy reader and the ways out it keeps', () => {
    expect(failureCode('idea', new ImportError('noIngredients'), false)).toBe('ideasFailed');
    expect(failureCode('idea', busy, false)).toBe('aiBusy');
    expect(failureCode('idea', busy, true)).toBe('ideasFailed');
    expect(failureCode('creator', new ImportError('creatorNotFound'), false)).toBe('creatorNotFound');
    expect(failureCode('plan', new ImportError('planNoRecipes'), false)).toBe('planNoRecipes');
    expect(failureCode('find', new ImportError('planNoRecipes'), false)).toBe('findFailed');
  });
});
