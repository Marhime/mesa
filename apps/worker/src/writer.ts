// Writes an extracted recipe: household products for unknown ingredients, then the recipe, its lines and its
// steps in one transaction (save_imported_recipe, migration 27). resolveIngredients (ingredients → rows,
// creating the household products they need) is also how a saved recipe's lines are read again (reread.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedIngredient, ExtractedRecipe, ImportPlatform, Product, ProductAlias } from '@mesa/shared';
import { authorColumns, type SourceAuthor } from './author';
import type { HouseholdCatalogs } from './catalog-store';
import { ImportError } from './errors';
import type { Logger } from './log';
import { planIngredients, resolveRows, type IngredientRow, type NewProduct } from './mapping';

const PRODUCT_COLUMNS = 'id, household_id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family';
export const DEFAULT_SERVINGS = 4;

export interface RecipeMeta {
  householdId: string;
  /** The job and the attempt that write it: only the run holding the job may (job-store.ts). */
  jobId: string;
  attempt: number;
  sourceUrl: string | null;
  platform: ImportPlatform;
  imagePath: string | null;
  /** Who made it; the columns are left out when unknown. */
  author?: SourceAuthor | null;
}

/** Escapes LIKE wildcards so ilike works as a case-insensitive equality. */
const likeExact = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Creates (or finds, on a unique conflict) the household product and its aliases. Null on failure. */
async function ensureProduct(
  db: SupabaseClient,
  householdId: string,
  np: NewProduct,
  lang: string,
  log: Logger,
): Promise<Product | null> {
  let product: Product | null = null;
  const { data, error } = await db
    .from('products')
    .insert({
      household_id: householdId,
      name_en: np.name_en,
      category: np.category,
      default_zone: np.default_zone,
      unit_family: np.unit_family,
    })
    .select(PRODUCT_COLUMNS)
    .single();
  if (!error && data) {
    product = data as Product;
  } else if (error?.code === '23505') {
    const found = await db
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('household_id', householdId)
      .ilike('name_en', likeExact(np.name_en))
      .limit(1)
      .maybeSingle();
    product = (found.data as Product | null) ?? null;
    if (!product) log.warn('product_conflict_unresolved', { name: np.name_en, err: found.error?.message });
  } else {
    log.warn('product_create_failed', { name: np.name_en, err: error?.message });
  }
  if (!product) return null;

  const aliases: ProductAlias[] = np.aliases.map((alias, i) => ({ product_id: product.id, alias, lang: i === 0 ? 'en' : lang }));
  if (aliases.length > 0) {
    const { error: aliasError } = await db
      .from('product_aliases')
      .upsert(aliases, { onConflict: 'product_id,alias', ignoreDuplicates: true });
    if (aliasError) log.warn('alias_create_failed', { product: product.id, err: aliasError.message });
  }
  // The household's next job sees it: its products' stamp changed (catalog-store.ts).
  return product;
}

/** The language of the aliases a new product gets besides its English name: the recipe's, else 'en'. */
export const aliasLanguage = (language: string | null | undefined): string =>
  language && /^[a-z]{2}$/.test(language) ? language : 'en';

export interface ResolvedIngredients {
  /** One per ingredient given, in order (position = its index). */
  rows: IngredientRow[];
  /** Rows linked to a product that already existed. */
  matched: number;
  createdProducts: number;
}

/**
 * Ingredients → recipe_ingredients rows, as an import does: planIngredients (catalog match, vague-name
 * guards), then the household products the unmatched names need, then their ids on the rows.
 */
export async function resolveIngredients(
  db: SupabaseClient,
  catalogs: HouseholdCatalogs,
  householdId: string,
  ingredients: readonly ExtractedIngredient[],
  lang: string,
  log: Logger,
): Promise<ResolvedIngredients> {
  const plan = planIngredients(ingredients, await catalogs.forHousehold(householdId));
  const created = new Map<string, Product>();
  for (const np of plan.newProducts) {
    const p = await ensureProduct(db, householdId, np, lang, log);
    if (p) created.set(np.key, p);
  }
  return {
    rows: resolveRows(plan, created),
    matched: plan.ingredients.filter((p) => p.newProductKey === null && p.row.product_id !== null).length,
    createdProducts: created.size,
  };
}

export interface WriteResult {
  recipeId: string;
  ingredients: number;
  matched: number;
  createdProducts: number;
}

/** A step as recipe_steps stores it (recipe_id aside). */
export interface StepRow {
  position: number;
  text: string;
  /** Where it starts in the video ("▶ 2:14" in the app). */
  start_s?: number;
}

/** What save_imported_recipe writes in one transaction (migration 27). */
export interface RecipeSave {
  /** The recipes columns an import sets (the household and the job are the database's). */
  recipe: Record<string, unknown>;
  ingredients: IngredientRow[];
  steps: StepRow[];
}

/** The recipe row, its lines and its steps, as an import writes them. */
export function recipeSave(extracted: ExtractedRecipe, meta: RecipeMeta, rows: IngredientRow[]): RecipeSave {
  const title = extracted.title.trim() !== '' ? extracted.title.trim().slice(0, 200) : 'Untitled recipe';
  return {
    recipe: {
      title,
      servings: extracted.servings ?? DEFAULT_SERVINGS,
      total_minutes: extracted.total_minutes,
      source_url: meta.sourceUrl,
      source_platform: meta.platform,
      image_path: meta.imagePath,
      ...authorColumns(meta.author),
      original: extracted,
    },
    ingredients: rows,
    steps: extracted.steps.map((text, position) => {
      const start = extracted.step_starts?.[position];
      return start != null ? { position, text, start_s: start } : { position, text };
    }),
  };
}

/** The job's run is no longer the one that holds it (save_imported_recipe's errcode). */
const JOB_MOVED_ON = 'P0004';

/**
 * Writes the recipe, its lines and its steps all at once, only for the run that holds the job (a run the
 * queue gave up on writes nothing), and gets back the recipe a job already has instead of a second one.
 */
async function saveImported(db: SupabaseClient, meta: RecipeMeta, save: RecipeSave, log: Logger): Promise<string> {
  const { data, error } = await db.rpc('save_imported_recipe', {
    p_job: meta.jobId,
    p_attempt: meta.attempt,
    p_recipe: save.recipe,
    p_ingredients: save.ingredients,
    p_steps: save.steps,
  });
  if (error?.code === JOB_MOVED_ON) throw new ImportError('saveFailed', { detail: 'job moved on' });
  if (error || typeof data !== 'string') throw new ImportError('saveFailed', { detail: `save_imported_recipe: ${error?.message ?? 'no recipe'}` });
  return data;
}

export async function writeRecipe(
  db: SupabaseClient,
  catalogs: HouseholdCatalogs,
  extracted: ExtractedRecipe,
  meta: RecipeMeta,
  log: Logger,
): Promise<WriteResult> {
  const { rows, matched, createdProducts } = await resolveIngredients(
    db, catalogs, meta.householdId, extracted.ingredients, aliasLanguage(extracted.language), log,
  );
  const recipeId = await saveImported(db, meta, recipeSave(extracted, meta, rows), log);
  return { recipeId, ingredients: rows.length, matched, createdProducts };
}
