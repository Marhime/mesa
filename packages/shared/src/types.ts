// Row types mirroring supabase/migrations/*.sql. Keep in sync with the schema.

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
export type ImportStatus = 'queued' | 'processing' | 'done' | 'failed';
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
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  position: number;
  text: string;
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

/** recipe: import a recipe · sweep: read a video/photo of a pantry zone · receipt: read a receipt. */
export type ImportKind = 'recipe' | 'sweep' | 'receipt';

export interface ImportJob {
  id: string;
  household_id: string;
  kind: ImportKind;
  /** The zone a sweep films. */
  zone: Zone | null;
  /** The pantry proposal a sweep / receipt produced. */
  proposal_id: string | null;
  input_url: string | null;
  input_text: string | null;
  input_image_path: string | null;
  platform: ImportPlatform | null;
  status: ImportStatus;
  error: string | null;
  attempts: number;
  recipe_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
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

/** What the import worker asks the model to return, and stores in recipes.original. */
export interface ExtractedRecipe {
  title: string;
  servings: number | null;
  total_minutes: number | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  language: string | null;
}

export interface ExtractedIngredient {
  /** The line as written in the source, in its language. */
  raw_text: string;
  /** Canonical English product name, singular, lowercase-friendly ("avocado", "chicken breast"). */
  name_en: string;
  quantity: number | null;
  /** Free unit as written ("cdta", "kg", "taza"); normalized later with parseUnit. */
  unit: string | null;
  /** True when the source did not state the quantity and it was inferred. */
  is_guessed: boolean;
  is_optional: boolean;
  category: Category | null;
}
