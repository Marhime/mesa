import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { errorCodeFor, ImportError, MESSAGES } from '../src/errors';
import type { Logger } from '../src/log';
import { jobProgress } from '../src/progress';

function fakeDb(fail: 'none' | 'error' | 'throw' = 'none') {
  const writes: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          if (fail === 'throw') throw new Error('network');
          writes.push(patch);
          return { error: fail === 'error' ? { message: 'denied' } : null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, writes };
}

const warnings: string[] = [];
const log = { warn: (msg: string) => warnings.push(msg), info: () => undefined, error: () => undefined } as unknown as Logger;

describe('jobProgress', () => {
  it('writes stages in order, keeps the first real title and skips generic ones', async () => {
    const { db, writes } = fakeDb();
    const p = jobProgress(db, 'job-1', log);
    p.preview({ title: 'Video by chef_x', imageUrl: 'https://cdn.example/thumb.jpg' });
    p.stage('downloading');
    p.preview({ title: 'Tinga de pollo' });
    p.stage('watching');
    p.preview({ title: 'Instagram', imageUrl: 'http://insecure.example/x.jpg' });
    await p.flush();
    expect(writes.map((w) => w.stage ?? w.preview_title ?? w.preview_image_url)).toEqual([
      'https://cdn.example/thumb.jpg',
      'downloading',
      'Tinga de pollo',
      'watching',
    ]);
    expect(writes[0]).not.toHaveProperty('preview_title');
  });

  it('never throws and keeps going after a failed write', async () => {
    const { db } = fakeDb('throw');
    const p = jobProgress(db, 'job-2', log);
    p.stage('reading');
    p.stage('writing');
    await expect(p.flush()).resolves.toBeUndefined();
    expect(warnings.filter((w) => w === 'progress_write_failed')).toHaveLength(2);
  });
});

describe('errorCodeFor', () => {
  it('names the failure so the app can offer the right way out', () => {
    expect(errorCodeFor(new ImportError('videoPrivate'))).toBe('videoPrivate');
    expect(errorCodeFor(new ImportError('aiBusy', { detail: 'gemini 503' }))).toBe('aiBusy');
    expect(new ImportError('aiBusy', { detail: 'gemini 503' }).userMessage).toBe(MESSAGES.aiBusy);
    expect(errorCodeFor(new Error('boom'))).toBe('unknown');
  });
});
