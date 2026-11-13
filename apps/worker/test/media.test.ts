// Private media: a job's media is read from 'scans', else from 'recipe-images' (older app builds); a kept
// dish photo becomes its own copy among the recipe pictures; the sweep removes what the database lists.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { recipeImages } from '../src/images';
import { storedJobMedia } from '../src/job-media';
import type { LogFields, Logger } from '../src/log';
import { MediaSweep } from '../src/media-sweep';
import type { ModelOutcome } from '../src/model-output';
import { runImport } from '../src/pipeline';
import { fakeDeps, fakeDb, fakeJob, silent } from './fake-deps';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Storage with these files, by bucket; every call recorded. */
function fakeStorage(files: Record<string, Record<string, Buffer>>) {
  const calls: Array<{ bucket: string; op: string; arg: unknown }> = [];
  const storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        calls.push({ bucket, op: 'download', arg: path });
        const bytes = files[bucket]?.[path];
        return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'Object not found' } };
      },
      upload: async (path: string, bytes: Buffer) => {
        calls.push({ bucket, op: 'upload', arg: path });
        (files[bucket] ??= {})[path] = bytes;
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        calls.push({ bucket, op: 'remove', arg: paths });
        return { data: paths.map((name) => ({ name })), error: null };
      },
    }),
  };
  return { storage, calls };
}

function recordingLog() {
  const events: Array<{ msg: string; fields?: LogFields }> = [];
  const push = (msg: string, fields?: LogFields): void => void events.push({ msg, fields });
  const logger: Logger = { debug: push, info: push, warn: push, error: push, child: () => logger };
  return { logger, events, names: () => events.map((e) => e.msg) };
}

describe('a job’s media', () => {
  it('comes from the private scans bucket', async () => {
    const { storage, calls } = fakeStorage({ scans: { 'h1/a.png': PNG }, 'recipe-images': { 'h1/a.png': Buffer.from('old') } });
    expect(await storedJobMedia({ storage } as unknown as SupabaseClient).read('h1', 'h1/a.png')).toEqual(PNG);
    expect(calls.map((c) => c.bucket)).toEqual(['scans']);
  });

  it('is looked for in recipe-images when an older app build put it there', async () => {
    const { storage, calls } = fakeStorage({ 'recipe-images': { 'h1/a.png': PNG } });
    expect(await storedJobMedia({ storage } as unknown as SupabaseClient).read('h1', 'h1/a.png')).toEqual(PNG);
    expect(calls.map((c) => c.bucket)).toEqual(['scans', 'recipe-images']);
  });

  it('is missing when neither bucket has it, and never read outside the household folder', async () => {
    const { storage, calls } = fakeStorage({ scans: { 'h2/a.png': PNG } });
    const media = storedJobMedia({ storage } as unknown as SupabaseClient);
    await expect(media.read('h1', 'h1/gone.png')).rejects.toMatchObject({ code: 'imageMissing', message: expect.stringMatching(/scans: Object not found; recipe-images: Object not found/) });
    calls.length = 0;
    await expect(media.read('h1', 'h2/a.png')).rejects.toMatchObject({ code: 'imageMissing' });
    expect(calls).toEqual([]);
  });
});

describe('a dish photo kept from a shared photo or screenshots', () => {
  const dish: ModelOutcome = {
    kind: 'recipe',
    imageShowsDish: true,
    recipe: { title: 'Tinga', servings: 4, total_minutes: null, ingredients: [{ raw_text: '1 onion', name_en: 'onion', quantity: 1, unit: null, is_guessed: false, is_optional: false, category: 'produce', section: null }], steps: [], language: 'es' },
  };
  const importOf = async (job: Parameters<typeof fakeJob>[0]) => {
    const deps = fakeDeps(fakeDb(() => null).db, async () => ({}), { index: { byAlias: new Map() }, products: [], phrases: new Map() } as never);
    const read = vi.fn(async () => PNG);
    return runImport({ ...deps, ai: { ...deps.ai, extractRecipe: async () => dish } as never, media: { read } }, fakeJob({ kind: 'recipe', ...job }), silent, new AbortController().signal).then((r) => ({ r, read }));
  };

  it('is its bytes, to copy among the recipe pictures, never the shared file', async () => {
    const one = await importOf({ input_image_path: 'h1/photo.png' });
    expect(one.r.image).toEqual({ kind: 'bytes', bytes: PNG });
    expect(one.read).toHaveBeenCalledWith('h1', 'h1/photo.png');

    const many = await importOf({ input_image_paths: ['h1/1.png', 'h1/2.png'] });
    expect(many.r.image).toEqual({ kind: 'bytes', bytes: PNG });
  });

  it('is uploaded to the household folder of recipe-images, and removed if the recipe is not written', async () => {
    const { storage, calls } = fakeStorage({});
    const stored = await recipeImages({ storage } as unknown as SupabaseClient).store('h1', { kind: 'bytes', bytes: PNG }, silent);
    expect(stored.path).toMatch(/^h1\/[0-9a-f-]{36}\.png$/);
    expect(calls).toEqual([{ bucket: 'recipe-images', op: 'upload', arg: stored.path }]);
    await stored.discard();
    expect(calls.at(-1)).toEqual({ bucket: 'recipe-images', op: 'remove', arg: [stored.path] });
  });
});

describe('MediaSweep', () => {
  const rows = (n: number, bucket: string) => Array.from({ length: n }, (_, i) => ({ bucket, path: `h1/${bucket}-${i}.png` }));

  function sweepWith(pages: unknown[]) {
    const { storage, calls } = fakeStorage({});
    const rpc = vi.fn(async () => {
      const page = pages.shift() ?? [];
      return page instanceof Error ? { data: null, error: page } : { data: page, error: null };
    });
    const log = recordingLog();
    return { sweep: new MediaSweep({ rpc, storage } as unknown as SupabaseClient, log.logger), rpc, calls, log };
  }

  it('removes what the database lists, bucket by bucket, a hundred at a time, and says how many', async () => {
    const { sweep, rpc, calls, log } = sweepWith([[...rows(150, 'scans'), ...rows(50, 'recipe-images')], rows(3, 'scans')]);
    expect(await sweep.sweep()).toEqual({ listed: 203, removed: 203 });
    expect(rpc).toHaveBeenCalledWith('shared_media_to_delete', { p_limit: 200 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(calls.map((c) => [c.bucket, (c.arg as string[]).length])).toEqual([['scans', 100], ['scans', 50], ['recipe-images', 50], ['scans', 3]]);
    expect(log.events.find((e) => e.msg === 'media_swept')?.fields).toEqual({ listed: 203, removed: 203 });
  });

  it('stays quiet when there is nothing, and stops at five full pages', async () => {
    const quiet = sweepWith([[]]);
    expect(await quiet.sweep.sweep()).toEqual({ listed: 0, removed: 0 });
    expect(quiet.log.names()).toEqual([]);

    const big = sweepWith(Array.from({ length: 9 }, () => rows(200, 'recipe-images')));
    expect((await big.sweep.sweep()).listed).toBe(1000);
    expect(big.rpc).toHaveBeenCalledTimes(5);
  });

  it('logs a failed listing and tries again next time', async () => {
    const failed = () => Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const { sweep, rpc, log } = sweepWith([failed(), rows(1, 'scans')]);
    await sweep.sweep();
    expect(log.names()).toEqual(['media_sweep_failed']);
    expect(await sweep.sweep()).toEqual({ listed: 1, removed: 1 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('sweeps at start, then on its timer, until stopped', async () => {
    vi.useFakeTimers();
    try {
      const { sweep, rpc } = sweepWith([]);
      sweep.start(1000);
      await vi.advanceTimersByTimeAsync(2500);
      expect(rpc).toHaveBeenCalledTimes(3);
      sweep.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(rpc).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
