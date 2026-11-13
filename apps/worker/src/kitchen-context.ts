// The household's kitchen as the asked kitchen jobs (plan, ask) read it with the service role: the food
// at home, the saved recipes with their ingredients (one in full when a question is about it), the
// shopping list and what is on the menu.
// Read only: these jobs answer in import_jobs.result and never write to the pantry, the list or recipes.
// "At home" is the SQL rule (pantry_has): a pantry row at home, or a staple of the household not marked out.
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatQuantity, type Unit } from '@mesa/shared';

import type { Catalog } from './mapping';
import { listLines, pantryRows, type PantryStatusRow } from './repos/kitchen';

/** Rows read at most per query (PostgREST answers 1000 at most). */
const MAX_ROWS = 1000;
/** Recipes read, newest first (with their ingredients, embedded). */
export const MAX_RECIPES = 500;
const MAX_MENU = 50;

export type FoodState = 'ok' | 'soon' | 'check';
const AT_HOME: ReadonlySet<string> = new Set<FoodState>(['ok', 'soon', 'check']);
/** Use soon, or a little past its date (still at home for 3 days). */
const GOES_SOON: ReadonlySet<string> = new Set<FoodState>(['soon', 'check']);

/** What the pantry rules here read of a pantry_status row. */
export type PantryRow = Pick<PantryStatusRow, 'product_id' | 'name_en' | 'state' | 'expires_on' | 'quantity' | 'unit'> & { level: string | null };

/** One food at home (all its rows together). */
export interface PantryFood {
  product_id: string;
  name: string;
  state: FoodState;
  /** The soonest date of its rows. */
  expires_on: string | null;
  /** "500 g", "half", or null when unknown. */
  amount: string | null;
}

export interface Pantry {
  /** Soonest to expire first, then by name. */
  foods: readonly PantryFood[];
  /** Staples not marked out and not already among the foods ("Always have"). */
  staples: readonly string[];
  /** At home: a row at home, or a staple not marked out. */
  has(productId: string | null): boolean;
  /** The food at home for a product (staples aside), or null. */
  food(productId: string | null): PantryFood | null;
}

export const goesSoon = (f: PantryFood): boolean => GOES_SOON.has(f.state);

/** Soonest date first, undated last. */
const byDate = (a: string | null, b: string | null): number => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

/** Soonest date first, undated last, then by name. */
export const bySoonest = (a: PantryFood, b: PantryFood): number => byDate(a.expires_on, b.expires_on) || a.name.localeCompare(b.name);

function amountOf(rows: readonly PantryRow[]): string | null {
  const first = rows[0];
  if (!first) return null;
  if (rows.every((r) => r.quantity !== null && r.quantity > 0 && r.unit === first.unit)) {
    return formatQuantity(rows.reduce((n, r) => n + (r.quantity ?? 0), 0), first.unit) || null;
  }
  return rows.length === 1 && first.level && first.level !== 'full' ? first.level : null;
}

function foodOf(rows: readonly PantryRow[]): PantryFood {
  const soonest = [...rows].sort((a, b) => byDate(a.expires_on, b.expires_on))[0]!;
  return { product_id: soonest.product_id, name: soonest.name_en.trim(), state: soonest.state as FoodState, expires_on: soonest.expires_on, amount: amountOf(rows) };
}

export function buildPantry(rows: readonly PantryRow[], staples: readonly { id: string; name_en: string }[]): Pantry {
  const atHome = new Map<string, PantryRow[]>();
  const out = new Set<string>();
  for (const r of rows) {
    if (r.state === 'out') out.add(r.product_id);
    if (!AT_HOME.has(r.state) || typeof r.name_en !== 'string' || r.name_en.trim() === '') continue;
    const list = atHome.get(r.product_id) ?? [];
    list.push(r);
    atHome.set(r.product_id, list);
  }
  const foods = [...atHome.values()].map(foodOf).sort(bySoonest);
  const byProduct = new Map(foods.map((f) => [f.product_id, f]));
  const kept = staples.filter((s) => !out.has(s.id));
  const stapleIds = new Set(kept.map((s) => s.id));
  return {
    foods,
    staples: kept.filter((s) => !byProduct.has(s.id)).map((s) => s.name_en).sort((a, b) => a.localeCompare(b)),
    has: (id) => id !== null && (byProduct.has(id) || stapleIds.has(id)),
    food: (id) => (id === null ? null : (byProduct.get(id) ?? null)),
  };
}

/** The household's staples: its own choice ("we always have it" / "we don't keep it"), else the product's. */
export function stapleProducts(catalog: Catalog | null, said: readonly { product_id: string; always_have: boolean }[]): { id: string; name_en: string }[] {
  const choice = new Map(said.map((s) => [s.product_id, s.always_have]));
  return (catalog?.products ?? []).filter((p) => choice.get(p.id) ?? p.is_staple).map((p) => ({ id: p.id, name_en: p.name_en }));
}

export async function loadPantry(db: SupabaseClient, catalog: Catalog | null, householdId: string): Promise<Pantry> {
  // Every row, out ones too: a staple marked out is not at home.
  const [rows, said] = await Promise.all([
    pantryRows(db, householdId),
    db.from('household_staples').select('product_id, always_have').eq('household_id', householdId).limit(MAX_ROWS),
  ]);
  if (said.error) throw new Error(`kitchen staples: ${said.error.message}`);
  return buildPantry(rows, stapleProducts(catalog, (said.data ?? []) as { product_id: string; always_have: boolean }[]));
}

export interface KitchenIngredient {
  name: string;
  product_id: string | null;
  is_optional: boolean;
}

export interface KitchenRecipe {
  id: string;
  title: string;
  total_minutes: number | null;
  servings: number;
  is_favorite: boolean;
  last_cooked_at: string | null;
  source_author: string | null;
  ingredients: KitchenIngredient[];
}

type RecipeRow = Omit<KitchenRecipe, 'ingredients'> & { recipe_ingredients?: (KitchenIngredient & { position: number })[] | null };

/** The household's recipes, newest first, each with its ingredients in order. */
export async function loadRecipes(db: SupabaseClient, householdId: string, max = MAX_RECIPES): Promise<KitchenRecipe[]> {
  const { data, error } = await db
    .from('recipes')
    .select('id, title, total_minutes, servings, is_favorite, last_cooked_at, source_author, recipe_ingredients(name, product_id, is_optional, position)')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(max);
  if (error) throw new Error(`kitchen recipes: ${error.message}`);
  return ((data ?? []) as RecipeRow[]).map(({ recipe_ingredients, ...r }) => ({
    ...r,
    source_author: r.source_author ?? null,
    ingredients: [...(recipe_ingredients ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ name: i.name, product_id: i.product_id, is_optional: i.is_optional === true })),
  }));
}

/** An ingredient line as the recipe says it. */
export interface FullIngredient extends KitchenIngredient {
  /** The line as written, in the recipe's language ("200 ml panna"). */
  raw_text: string;
  quantity: number | null;
  unit: Unit | null;
}

/** A recipe in full: what "Ask about this recipe" reads. */
export interface FullRecipe {
  id: string;
  title: string;
  servings: number;
  total_minutes: number | null;
  ingredients: FullIngredient[];
  steps: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FullRow = Omit<FullRecipe, 'ingredients' | 'steps'> & {
  recipe_ingredients?: (FullIngredient & { position: number })[] | null;
  recipe_steps?: { text: string; position: number }[] | null;
};

const byPosition = (a: { position: number }, b: { position: number }): number => a.position - b.position;

/** One recipe of the household with its ingredients and steps in order; null when it isn't theirs. */
export async function loadFullRecipe(db: SupabaseClient, householdId: string, recipeId: string): Promise<FullRecipe | null> {
  if (!UUID.test(recipeId)) return null;
  const { data, error } = await db
    .from('recipes')
    .select('id, title, servings, total_minutes, recipe_ingredients(name, raw_text, quantity, unit, product_id, is_optional, position), recipe_steps(text, position)')
    .eq('id', recipeId)
    .eq('household_id', householdId)
    .maybeSingle();
  if (error) throw new Error(`kitchen recipe: ${error.message}`);
  if (!data) return null;
  const { recipe_ingredients, recipe_steps, ...r } = data as FullRow;
  return {
    id: r.id,
    title: r.title,
    servings: r.servings,
    total_minutes: r.total_minutes ?? null,
    ingredients: [...(recipe_ingredients ?? [])].sort(byPosition).map((i) => ({
      name: i.name,
      raw_text: i.raw_text ?? '',
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      product_id: i.product_id ?? null,
      is_optional: i.is_optional === true,
    })),
    steps: [...(recipe_steps ?? [])].sort(byPosition).map((s) => s.text),
  };
}

/** A recipe against what is at home. */
export interface Coverage {
  /** Needed (not optional) ingredients at home. */
  have: number;
  /** Needed ingredients. */
  total: number;
  /** Foods at home it uses that go soon, soonest first. */
  soon: PantryFood[];
  /** Every food at home it uses (staples aside), soonest first. */
  uses: PantryFood[];
}

export function coverage(recipe: Pick<KitchenRecipe, 'ingredients'>, pantry: Pantry): Coverage {
  const needed = recipe.ingredients.filter((i) => !i.is_optional);
  const uses = new Map<string, PantryFood>();
  for (const i of recipe.ingredients) {
    const f = pantry.food(i.product_id);
    if (f) uses.set(f.product_id, f);
  }
  const used = [...uses.values()].sort(bySoonest);
  return { have: needed.filter((i) => pantry.has(i.product_id)).length, total: needed.length, soon: used.filter(goesSoon), uses: used };
}

/** The shopping list, as lines ("Milk (1 l)"). */
export async function loadToBuy(db: SupabaseClient, householdId: string): Promise<string[]> {
  return (await listLines(db, householdId, ['to_buy']))
    .map((g) => {
      const amount = formatQuantity(g.quantity, g.unit);
      return `${g.label.replace(/\s+/g, ' ').trim()}${amount ? ` (${amount})` : ''}`;
    })
    .filter((line) => line !== '');
}

export interface MenuEntry {
  recipe_id: string;
  servings: number;
}

/** What is on the menu (up_next), oldest first. */
export async function loadMenu(db: SupabaseClient, householdId: string): Promise<MenuEntry[]> {
  const { data, error } = await db.from('up_next').select('recipe_id, servings').eq('household_id', householdId).order('created_at').limit(MAX_MENU);
  if (error) throw new Error(`kitchen menu: ${error.message}`);
  return (data ?? []) as MenuEntry[];
}
