// Row types mirroring the tables of supabase/migrations/*.sql (the latest schema: db-tests/schema.sql).
import type { FoundVideo } from './results';

export type Category =
  | 'produce'
  | 'bakery'
  | 'meat'
  | 'dairy'
  | 'frozen'
  | 'cupboard'
  | 'drinks'
  | 'household'
  | 'other';
export type Zone = 'fridge' | 'freezer' | 'cupboard';
export type UnitFamily = 'mass' | 'volume' | 'count' | 'other';
/** Normalized unit codes stored in the database. Mass is always g, volume always ml. */
export type Unit =
  | 'g'
  | 'ml'
  | 'unit'
  | 'tbsp'
  | 'tsp'
  | 'cup'
  | 'can'
  | 'bunch'
  | 'pack'
  | 'clove'
  | 'pinch'
  | 'slice';
export type GroceryStatus = 'to_buy' | 'in_cart' | 'bought' | 'removed';
export type GrocerySource = 'manual' | 'recipe' | 'usual' | 'ran_out';
export type PantryReason = 'purchase' | 'cook' | 'correction' | 'have';
export type PantryLevel = 'full' | 'half' | 'low' | 'out';
export type ImportPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'web'
  | 'image'
  | 'text'
  | 'manual'
  | 'other';

export interface Household {
  id: string;
  name: string;
  default_servings: number;
  created_at: string;
}

export interface Profile {
  id: string;
  household_id: string | null;
  display_name: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  household_id: string | null;
  name_en: string;
  category: Category;
  default_zone: Zone;
  shelf_life_days: number | null;
  is_staple: boolean;
  unit_family: UnitFamily;
  /** Pantry section (see looks.ts); null or absent for products a household created. */
  family?: string | null;
  /** Drawing (see looks.ts); null or absent for products a household created. */
  picto?: string | null;
}

export interface ProductAlias {
  product_id: string;
  alias: string;
  lang: string;
}

export interface Recipe {
  id: string;
  household_id: string;
  title: string;
  servings: number;
  total_minutes: number | null;
  source_url: string | null;
  source_platform: ImportPlatform;
  /** Who made it ("Food is Love"), when the source says so. */
  source_author?: string | null;
  /** The creator's channel page and id (YouTube), for "More from …". */
  source_channel_url?: string | null;
  source_channel_id?: string | null;
  image_path: string | null;
  original: unknown | null;
  notes: string | null;
  is_favorite: boolean;
  last_cooked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  position: number;
  raw_text: string;
  name: string;
  product_id: string | null;
  quantity: number | null;
  unit: Unit | null;
  is_guessed: boolean;
  is_optional: boolean;
  /** The part of the recipe it belongs to ("Marinade", "Sauce"); null for a recipe with one list. */
  section: string | null;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  position: number;
  text: string;
  /** Second of the source video where this step starts (YouTube); null when unknown. */
  start_s?: number | null;
}

export interface UpNext {
  id: string;
  household_id: string;
  recipe_id: string;
  servings: number;
  planned_for: string | null;
  created_at: string;
}

export interface GroceryItem {
  id: string;
  household_id: string;
  label: string;
  product_id: string | null;
  quantity: number | null;
  unit: Unit | null;
  category: Category;
  status: GroceryStatus;
  source: GrocerySource;
  checked_at: string | null;
  bought_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroceryItemRecipe {
  grocery_item_id: string;
  up_next_id: string;
  recipe_title: string;
  quantity: number | null;
  unit: Unit | null;
}


export interface PantryItem {
  id: string;
  household_id: string;
  product_id: string;
  zone: Zone;
  quantity: number | null;
  unit: Unit | null;
  level: PantryLevel | null;
  expires_on: string | null;
  updated_at: string;
}

/** One ingredient cook_recipe took out of the pantry. */
export interface CookedIngredient {
  product_id: string;
  label: string;
  category: Category;
  /** Amount used, in `unit`; null when the recipe gave none. */
  used: number | null;
  unit: Unit | null;
  /** What is left in `unit`; null when only the level is known. */
  left_quantity: number | null;
  left_level: PantryLevel | null;
  ran_out: boolean;
  /** It was about to turn: used in time. */
  saved: boolean;
}

/** recipe_coverage(): what a recipe needs against what is at home. */
export interface RecipeCoverage {
  recipe_id: string;
  /** Staples + ingredients at home. */
  have_count: number;
  /** What "Plan it" would put on the list. */
  need_count: number;
  /** Non-staple ingredients at home. */
  pantry_count: number;
  /** Product names of those to use soon, soonest first. */
  soon_names: string[];
}

export interface UsualProduct {
  product_id: string;
  name_en: string;
  category: Category;
  times: number;
}

/** A recipe's title and steps in another language, written by the worker on request. */
export interface RecipeTranslation {
  recipe_id: string;
  /** ISO 639-1. */
  lang: string;
  title: string;
  steps: string[];
}

/** A recipe video of a followed creator, kept by the daily follow_check ("New from your creators"). */
export interface CreatorVideo {
  id: string;
  household_id: string;
  channel_id: string;
  /** https://www.youtube.com/watch?v=… */
  url: string;
  title: string;
  dish: string | null;
  views: number | null;
  duration_s: number | null;
  thumbnail: string | null;
  is_recipe: boolean;
  /** Seen for the first time after the baseline, and nobody opened, saved or dismissed it yet. */
  is_new: boolean;
  first_seen_at: string;
}

/** A row of `suggestions` (For you, weekly). */
export interface Suggestion extends FoundVideo {
  id: string;
  household_id: string;
  score: number;
  status: 'new' | 'saved' | 'dismissed';
  created_at: string;
  expires_at: string;
}
