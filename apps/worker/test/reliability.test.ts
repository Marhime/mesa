// Small promises kept: a scan's local copy goes when the upload fails, a failed read fails the tidy job
// instead of passing for "nothing to do", and an idea job only reads a product its household may see.
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { storedJobMedia } from '../src/job-media';
import type { ScanDeps } from '../src/ports';
import { processJob } from '../src/runner';
import { runScan } from '../src/scan';
import { runTidy } from '../src/tidy';
import { fakeDb, fakeDeps, fakeJob, jobUpdate, silent } from './fake-deps';

const scanDirs = async (): Promise<string[]> => (await readdir(tmpdir())).filter((d) => d.startsWith('mesa-scan-'));

describe('a scan video whose upload fails', () => {
  it('leaves no local copy behind', async () => {
    const before = await scanDirs();
    const db = {
      storage: { from: () => ({ download: async () => ({ data: new Blob([Buffer.from('not really a video')]), error: null }) }) },
    } as unknown as SupabaseClient;
    const deps: ScanDeps = {
      db,
      media: storedJobMedia(db),
      ai: { askJson: vi.fn(), uploadFile: vi.fn(async () => { throw new Error('upload refused'); }), deleteFile: vi.fn() },
      catalog: { forHousehold: async () => ({ index: { byAlias: new Map() }, products: [], phrases: new Map() }) as never },
    };
    await expect(runScan(deps, fakeJob({ kind: 'sweep', input_image_path: 'h1/fridge.mp4', zone: 'fridge' }), 'sweep', silent, new AbortController().signal)).rejects.toThrow('upload refused');
    expect(await scanDirs()).toEqual(before);
    expect(deps.ai.askJson).not.toHaveBeenCalled();
  });
});

describe('tidy', () => {
  it('fails when the list lines cannot be read', async () => {
    const answer = (table: string) => (table === 'grocery_items' ? { data: null, error: { message: 'connection reset' } } : { data: [], error: null });
    const from = (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'or', 'limit', 'maybeSingle']) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer(table)).then(resolve);
      return b;
    };
    const deps = fakeDeps({ from } as unknown as SupabaseClient, async () => ({}));
    await expect(runTidy(deps, fakeJob({ kind: 'tidy', input_text: 'everything waiting' }), silent, new AbortController().signal)).rejects.toThrow(
      'tidy lines: connection reset',
    );
    expect(deps.ai.askJson).not.toHaveBeenCalled();
  });
});

describe('an idea about a product', () => {
  it("reads the product's name from the shared catalog or the household's own products only", async () => {
    const { db, calls } = fakeDb((c) => (c.table === 'products' ? { name_en: 'Tomato' } : []));
    const d = fakeDeps(db, async () => ({ ideas: [{ title: 'Pico de gallo', uses: ['tomato'], to_buy: [], minutes: 10, why: 'Fresh.' }] }));
    await processJob(d, fakeJob({ kind: 'idea', subject_id: 'tomato', input_text: null }), silent, { shutdown: new AbortController().signal });
    expect(calls.find((c) => c.table === 'products')!.filters).toContainEqual(['or', 'household_id.is.null,household_id.eq.h1']);
    expect(jobUpdate(calls)).toMatchObject({ status: 'done', result: { food: 'Tomato' } });
  });
});
