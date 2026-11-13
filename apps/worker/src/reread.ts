// Redo ingredients (kind reread): a saved recipe's ingredient lines, as the editor shows them, read again
// one by one with today's naming and matching rules (the way an import reads a website's lines), then
// rewritten in place. The recipe keeps its title, steps, favorite and history; every line is kept with its
// text exactly as stored. A recipe with sections keeps them and its order; one without any gets the parts
// the model finds from its steps (section-guess.ts: a marinade, a sauce…, or none for a simple list), its
// lines then ordered part by part. An edit made while the lines were read always wins: they are written
// only if the recipe is still as it was read (apply_reread, migrations 27 and 29).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJob, RereadResult } from '@mesa/shared';
import { ImportError } from './errors';
import { withSections } from './ingredient-sections';
import { readIngredientLines } from './ingredient-lines';
import { knownNames } from './known-names';
import type { Logger } from './log';
import type { IngredientRow } from './mapping';
import type { RereadDeps } from './ports';
import { guessParts } from './section-guess';
import { aliasLanguage, resolveIngredients } from './writer';

const LINE_COLUMNS = 'id, position, raw_text, name, product_id, quantity, unit, is_guessed, is_optional, section';

/** A recipe_ingredients row as stored (recipe_id aside). */
export interface StoredLine extends IngredientRow {
  id: string;
}

interface Target {
  id: string;
  /**
   * recipes.updated_at when it was read, exactly as the database wrote it (microseconds: never through a
   * Date), which every line write moves (migration 25).
   */
  updated_at: string;
  title: string;
  /** What the import read the recipe in (recipes.original), for the aliases of new products. */
  language: string | null;
}

async function loadRecipe(db: SupabaseClient, job: ImportJob): Promise<Target> {
  if (!job.subject_id) throw new ImportError('rereadFailed', { detail: 'no recipe' });
  const { data, error } = await db
    .from('recipes')
    .select('id, updated_at, title, language:original->>language')
    .eq('id', job.subject_id)
    .eq('household_id', job.household_id)
    .maybeSingle();
  if (error) throw new Error(`recipe: ${error.message}`);
  if (!data) throw new ImportError('rereadFailed', { detail: 'recipe not found in the household' });
  return data as Target;
}

async function loadLines(db: SupabaseClient, recipeId: string): Promise<StoredLine[]> {
  const { data, error } = await db.from('recipe_ingredients').select(LINE_COLUMNS).eq('recipe_id', recipeId).order('position').order('id');
  if (error) throw new Error(`recipe_ingredients: ${error.message}`);
  return (data ?? []) as StoredLine[];
}

async function loadSteps(db: SupabaseClient, recipeId: string): Promise<string[]> {
  const { data, error } = await db.from('recipe_steps').select('text').eq('recipe_id', recipeId).order('position');
  if (error) throw new Error(`recipe_steps: ${error.message}`);
  return ((data ?? []) as { text: string }[]).map((s) => s.text);
}

/**
 * The lines with the parts found for a recipe saved without sections (`parts[i]` for line i), cleaned like an
 * import's and ordered part by part, positions 0…n-1. A recipe that has sections keeps them: unchanged.
 */
export function withParts(rows: readonly StoredLine[], parts: readonly (string | null)[]): StoredLine[] {
  if (rows.some((r) => r.section !== null)) return [...rows];
  return withSections(rows.map((r, i) => ({ ...r, section: parts[i] ?? null }))).map((r, position) => ({ ...r, position }));
}

export interface MergedLines {
  /** One per stored line, same id and order, positions 0…n-1. */
  rows: StoredLine[];
  /** Lines nothing could name, kept exactly as they were. */
  unchanged: number;
}

/**
 * What to write for each stored line. `reread[i]` is line i read again, or null when nothing named it:
 * that line stays as it was. A line read again keeps its id, its raw_text and its section exactly, and
 * takes the new name, product, amount and optional flag, except:
 * - no amount in the text but one stored (the import read it from words or from the video): the stored
 *   quantity, unit and is_guessed stay;
 * - a line stored as optional stays optional: the import saw the recipe around it ("For serving:"), a
 *   line read alone does not.
 */
export function mergeLines(stored: readonly StoredLine[], reread: ReadonlyArray<IngredientRow | null>): MergedLines {
  let unchanged = 0;
  const rows = stored.map((old, position): StoredLine => {
    const row = reread[position];
    if (!row) {
      unchanged++;
      return { ...old, position };
    }
    const keepAmount = row.quantity === null && old.quantity !== null;
    return {
      id: old.id,
      position,
      raw_text: old.raw_text,
      name: row.name,
      product_id: row.product_id,
      quantity: keepAmount ? old.quantity : row.quantity,
      unit: keepAmount ? old.unit : row.unit,
      is_guessed: keepAmount ? old.is_guessed : row.is_guessed,
      is_optional: row.is_optional || old.is_optional,
      section: old.section,
    };
  });
  return { rows, unchanged };
}

const sameLine = (a: StoredLine, b: StoredLine): boolean =>
  a.position === b.position && a.name === b.name && a.product_id === b.product_id && a.quantity === b.quantity &&
  a.unit === b.unit && a.is_guessed === b.is_guessed && a.is_optional === b.is_optional && a.section === b.section;

/**
 * Rewrites the lines in place, by id, all or none, only if the recipe is still as it was read: an edit
 * meanwhile (a line saved, added or removed moves recipes.updated_at) wins, and the reread fails. The
 * database never writes a line's text here, nor its section once the recipe has any (migration 29).
 */
async function writeLines(db: SupabaseClient, recipe: Target, rows: readonly StoredLine[]): Promise<void> {
  const { data, error } = await db.rpc('apply_reread', { p_recipe: recipe.id, p_read_at: recipe.updated_at, p_rows: rows });
  if (error) throw new Error(`apply_reread: ${error.message}`);
  if (data !== true) throw new ImportError('rereadFailed', { detail: 'the recipe changed while it was read' });
}

/** Reads the recipe's lines again and rewrites them; `result` says how many there are and how many are linked. */
export async function runReread(deps: RereadDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<RereadResult> {
  const { db, catalog } = deps;
  const household = job.household_id;
  const recipe = await loadRecipe(db, job);
  const stored = await loadLines(db, recipe.id);
  if (stored.length === 0) {
    log.info('reread_done', { lines: 0, linked: 0, unchanged: 0, changed: 0, created_products: 0 });
    return { lines: 0, linked: 0 };
  }

  const index = await catalog.forHousehold(household);
  const read = await readIngredientLines(
    stored.map((l) => l.raw_text),
    index,
    (pending) => deps.ai.translateNames(pending, knownNames(index, pending.map((p) => p.line)), signal),
  );
  const named = read.flatMap((ing, i) => (ing ? [{ i, ing }] : []));
  const resolved = await resolveIngredients(db, catalog, household, named.map((n) => n.ing), aliasLanguage(recipe.language), log);
  const reread: Array<IngredientRow | null> = stored.map(() => null);
  named.forEach(({ i }, k) => {
    reread[i] = resolved.rows[k] ?? null;
  });
  const merged = mergeLines(stored, reread);
  const sectioned = stored.some((l) => l.section !== null);
  const parts = sectioned
    ? []
    : await guessParts(deps.ai, { title: recipe.title, lines: stored.map((l) => l.raw_text), steps: await loadSteps(db, recipe.id) }, log, signal);
  const rows = withParts(merged.rows, parts);

  if (signal.aborted) throw signal.reason;
  // Writing the lines touches the recipe (migration 25): live sync refreshes both phones.
  await writeLines(db, recipe, rows);

  const result: RereadResult = { lines: rows.length, linked: rows.filter((r) => r.product_id !== null).length };
  const before = new Map(stored.map((l) => [l.id, l]));
  log.info('reread_done', {
    ...result,
    unchanged: merged.unchanged,
    changed: rows.filter((r) => !sameLine(r, before.get(r.id)!)).length,
    created_products: resolved.createdProducts,
    sections: new Set(rows.map((r) => r.section).filter((s) => s !== null)).size,
  });
  return result;
}
