// One recipe per import: the recipe, its lines and its steps in one call that only the run holding the job
// may make; a job an earlier run already wrote finishes with that recipe, without reading anything; a
// failed lookup of the saved links fails the job instead of importing a duplicate.
import type { ExtractedRecipe, ImportJob } from '@mesa/shared';
import { describe, expect, it, vi } from 'vitest';

import { recipeHandler, type RecipePorts } from '../src/handlers/recipe';
import { buildCatalog } from '../src/mapping';
import { noProgress } from '../src/progress';
import { savedRecipes } from '../src/repos/recipes';
import { writeRecipe, type RecipeMeta } from '../src/writer';
import { fakeDb, fakeJob, FakeDbError, silent, type Call } from './fake-deps';

const catalogs = { forHousehold: async () => buildCatalog([], []) };

const RECIPE: ExtractedRecipe = {
  title: '  Beef stir-fry  ',
  servings: null,
  total_minutes: 25,
  language: 'en',
  ingredients: [
    { raw_text: '1 tbsp dark soy sauce', name_en: 'dark soy sauce', quantity: 1, unit: 'tbsp', is_guessed: false, is_optional: false, category: 'cupboard', section: 'Marinade' },
    { raw_text: '2 tbsp dark soy sauce', name_en: 'dark soy sauce', quantity: 2, unit: 'tbsp', is_guessed: false, is_optional: false, category: 'cupboard', section: 'Sauce' },
  ],
  steps: ['Marinate the beef.', 'Fry.'],
  step_starts: [12, null],
};

const META: RecipeMeta = {
  householdId: 'h1',
  jobId: 'job-1',
  attempt: 2,
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  platform: 'youtube',
  imagePath: 'h1/pic.jpg',
  author: { name: 'Food is Love', channelUrl: 'https://www.youtube.com/channel/UCE-NIVMcV8A2GwGcCYLSMDQ', channelId: 'UCE-NIVMcV8A2GwGcCYLSMDQ' },
};

/** A kitchen whose products insert answers the row, and whose save answers `save`. */
const kitchen = (save: (call: Call) => unknown) =>
  fakeDb((c) => {
    if (c.op === 'rpc') return save(c);
    if (c.table === 'products' && c.op === 'insert') return { id: 'p-dark-soy', household_id: 'h1', name_en: 'Dark soy sauce', category: 'cupboard' };
    if (c.table === 'recipes' && c.op === 'insert') return { id: 'r-legacy' };
    return null;
  });

describe('writeRecipe', () => {
  it('writes the recipe, its lines (with their sections) and its steps in one call, for this run of the job', async () => {
    const { db, calls } = kitchen(() => 'r-1');
    const written = await writeRecipe(db, catalogs, RECIPE, META, silent);
    expect(written).toEqual({ recipeId: 'r-1', ingredients: 2, matched: 0, createdProducts: 1 });

    const save = calls.find((c) => c.op === 'rpc')!;
    expect(save.table).toBe('save_imported_recipe');
    const args = save.payload as Record<string, unknown>;
    expect(args).toMatchObject({ p_job: 'job-1', p_attempt: 2 });
    expect(args.p_recipe).toEqual({
      title: 'Beef stir-fry',
      servings: 4,
      total_minutes: 25,
      source_url: META.sourceUrl,
      source_platform: 'youtube',
      image_path: 'h1/pic.jpg',
      source_author: 'Food is Love',
      source_channel_url: META.author!.channelUrl,
      source_channel_id: META.author!.channelId,
      original: RECIPE,
    });
    // One product for both lines; each line keeps its own section and amount.
    expect(args.p_ingredients).toEqual([
      { position: 0, raw_text: '1 tbsp dark soy sauce', name: 'Dark soy sauce', product_id: 'p-dark-soy', quantity: 1, unit: 'tbsp', is_guessed: false, is_optional: false, section: 'Marinade' },
      { position: 1, raw_text: '2 tbsp dark soy sauce', name: 'Dark soy sauce', product_id: 'p-dark-soy', quantity: 2, unit: 'tbsp', is_guessed: false, is_optional: false, section: 'Sauce' },
    ]);
    expect(args.p_steps).toEqual([{ position: 0, text: 'Marinate the beef.', start_s: 12 }, { position: 1, text: 'Fry.' }]);
    expect(calls.some((c) => ['recipes', 'recipe_ingredients', 'recipe_steps'].includes(c.table) && c.op !== 'select')).toBe(false);
  });

  it('writes nothing for a run the queue gave up on', async () => {
    const { db } = kitchen(() => new FakeDbError('P0004', 'job moved on'));
    await expect(writeRecipe(db, catalogs, RECIPE, META, silent)).rejects.toMatchObject({ code: 'saveFailed', message: expect.stringContaining('job moved on') });
    const broken = kitchen(() => new FakeDbError('23514', 'check violation'));
    await expect(writeRecipe(broken.db, catalogs, RECIPE, META, silent)).rejects.toMatchObject({ code: 'saveFailed' });
  });
});

describe('savedRecipes', () => {
  it('throws when the saved links cannot be read: not knowing is no reason to import twice', async () => {
    const { db } = fakeDb(() => new FakeDbError('08006', 'connection reset'));
    await expect(savedRecipes(db).byUrl('h1', 'https://x.example/tinga')).rejects.toThrow('recipes by link: connection reset');
    await expect(savedRecipes(db).byJob('h1', 'job-1')).rejects.toThrow('recipes by job: connection reset');
  });

  it('finds the recipe of a job in its household', async () => {
    const { db, calls } = fakeDb(() => ({ id: 'r-9' }));
    expect(await savedRecipes(db).byJob('h1', 'job-1')).toBe('r-9');
    expect(calls[0]!.filters).toEqual(expect.arrayContaining([['eq', 'household_id', 'h1'], ['eq', 'import_job_id', 'job-1']]));
  });
});

describe('a recipe import', () => {
  const ports = (over: Partial<RecipePorts>): RecipePorts => ({
    sourceUrl: () => 'https://x.example/tinga',
    platform: () => 'web',
    saved: { byUrl: async () => null, byJob: async () => null },
    read: vi.fn(async () => { throw new Error('should not read'); }),
    images: { store: vi.fn() },
    write: vi.fn(),
    readReceipt: vi.fn(),
    ...over,
  });
  const run = (p: RecipePorts, job: Partial<ImportJob> = {}) =>
    recipeHandler(p).run({ job: fakeJob({ kind: 'recipe', input_url: 'https://x.example/tinga', ...job }), log: silent, signal: new AbortController().signal, progress: noProgress });

  it('finishes at once with the recipe an earlier run of the job wrote: nothing read, no model call', async () => {
    const byUrl = vi.fn(async () => null);
    const p = ports({ saved: { byUrl, byJob: async (h, j) => (h === 'h1' && j === 'job-1' ? 'r-written' : null) } });
    expect(await run(p)).toMatchObject({ columns: { recipe_id: 'r-written' } });
    expect(p.read).not.toHaveBeenCalled();
    expect(p.write).not.toHaveBeenCalled();
    expect(byUrl).not.toHaveBeenCalled();
  });

  it('fails when the saved links cannot be read, instead of importing a duplicate', async () => {
    const p = ports({ saved: { byUrl: async () => { throw new Error('recipes by link: connection reset'); }, byJob: async () => null } });
    await expect(run(p)).rejects.toThrow('connection reset');
    expect(p.read).not.toHaveBeenCalled();
  });

  it('writes with the job and the attempt that read it', async () => {
    const write = vi.fn(async () => ({ recipeId: 'r-new', ingredients: 2, matched: 0, createdProducts: 1 }));
    const p = ports({
      read: async () => ({ recipe: RECIPE, platform: 'web', sourceUrl: 'https://x.example/tinga', image: null }),
      images: { store: async () => ({ path: null, discard: async () => undefined }) },
      write,
    });
    expect(await run(p, { attempts: 3 })).toMatchObject({ columns: { recipe_id: 'r-new' } });
    expect(write).toHaveBeenCalledWith(RECIPE, expect.objectContaining({ householdId: 'h1', jobId: 'job-1', attempt: 3 }), silent);
  });
});
