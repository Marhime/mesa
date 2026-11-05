// Writes an extracted recipe: household products for unknown ingredients, then recipe, ingredients, steps.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedRecipe, ImportPlatform, Product, ProductAlias } from '@mesa/shared';
import type { CatalogStore } from './catalog-store';
import { ImportError, MESSAGES } from './errors';
import type { Logger } from './log';
import { planIngredients, resolveRows, type NewProduct } from './mapping';

const PRODUCT_COLUMNS = 'id, household_id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family';
export const DEFAULT_SERVINGS = 4;

export interface RecipeMeta {
  householdId: string;
  sourceUrl: string | null;
  platform: ImportPlatform;
  imagePath: string | null;
}

/** Escapes LIKE wildcards so ilike works as a case-insensitive equality. */
const likeExact = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Creates (or finds, on a unique conflict) the household product and its aliases. Null on failure. */
async function ensureProduct(
  db: SupabaseClient,
  store: CatalogStore,
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
  store.remember(product, aliases);
  return product;
}

export interface WriteResult {
  recipeId: string;
  ingredients: number;
  matched: number;
  createdProducts: number;
}

export async function writeRecipe(
  db: SupabaseClient,
  store: CatalogStore,
  extracted: ExtractedRecipe,
  meta: RecipeMeta,
  log: Logger,
): Promise<WriteResult> {
  const plan = planIngredients(extracted.ingredients, store.forHousehold(meta.householdId));
  const lang = extracted.language && /^[a-z]{2}$/.test(extracted.language) ? extracted.language : 'es';

  const created = new Map<string, Product>();
  for (const np of plan.newProducts) {
    const p = await ensureProduct(db, store, meta.householdId, np, lang, log);
    if (p) created.set(np.key, p);
  }
  const rows = resolveRows(plan, created);

  const title = extracted.title.trim() !== '' ? extracted.title.trim().slice(0, 200) : 'Untitled recipe';
  const { data: recipe, error: recipeError } = await db
    .from('recipes')
    .insert({
      household_id: meta.householdId,
      title,
      servings: extracted.servings ?? DEFAULT_SERVINGS,
      total_minutes: extracted.total_minutes,
      source_url: meta.sourceUrl,
      source_platform: meta.platform,
      image_path: meta.imagePath,
      original: extracted,
    })
    .select('id')
    .single();
  if (recipeError || !recipe) {
    throw new ImportError(MESSAGES.saveFailed, { detail: `recipes insert: ${recipeError?.message ?? 'no row'}` });
  }
  const recipeId = (recipe as { id: string }).id;

  const cleanup = async (what: string, message: string): Promise<never> => {
    const { error } = await db.from('recipes').delete().eq('id', recipeId);
    if (error) log.warn('recipe_cleanup_failed', { recipe: recipeId, err: error.message });
    throw new ImportError(MESSAGES.saveFailed, { detail: `${what}: ${message}` });
  };

  if (rows.length > 0) {
    const { error } = await db.from('recipe_ingredients').insert(rows.map((r) => ({ ...r, recipe_id: recipeId })));
    if (error) await cleanup('recipe_ingredients insert', error.message);
  }
  if (extracted.steps.length > 0) {
    const steps = extracted.steps.map((text, position) => ({ recipe_id: recipeId, position, text }));
    const { error } = await db.from('recipe_steps').insert(steps);
    if (error) await cleanup('recipe_steps insert', error.message);
  }

  return {
    recipeId,
    ingredients: rows.length,
    matched: plan.ingredients.filter((p) => p.newProductKey === null && p.row.product_id !== null).length,
    createdProducts: created.size,
  };
}
