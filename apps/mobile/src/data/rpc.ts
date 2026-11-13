// Typed wrappers for the Postgres functions in supabase/migrations/*_functions.sql and *_pantry.sql.
import type {
  Category,
  CookedIngredient,
  GroceryItem,
  GrocerySource,
  PantryLevel,
  RecipeCoverage,
  Unit,
  UsualProduct,
  Zone,
} from '@mesa/shared';

import { supabase } from './supabase';

interface RpcMap {
  create_household: { args: { p_name: string }; returns: string };
  create_invite: { args: Record<string, never>; returns: string };
  /** The kitchen joined; null when the code opens none (wrong, used or expired). */
  join_household: { args: { p_code: string }; returns: string | null };
  add_grocery_item: {
    args: {
      p_label: string;
      p_product_id: string | null;
      p_quantity: number | null;
      p_unit: Unit | null;
      p_category: Category;
      p_source: GrocerySource;
    };
    returns: GroceryItem;
  };
  mark_have: { args: { p_item_id: string }; returns: null };
  complete_shopping: { args: { p_put_away: PutAwayChoice[] | null }; returns: number };
  usual_products: { args: { p_limit: number }; returns: UsualProduct[] };
  /** p_servings null = the household's default. */
  plan_recipe: { args: { p_recipe_id: string; p_servings: number | null }; returns: string };
  unplan: { args: { p_up_next_id: string }; returns: null };
  cook_recipe: { args: { p_recipe_id: string; p_servings: number }; returns: CookedIngredient[] };
  recipe_coverage: { args: Record<string, never>; returns: RecipeCoverage[] };
  ingredient_availability: {
    args: { p_recipe_id: string };
    returns: { ingredient_id: string; at_home: boolean; soon: boolean; always_have: boolean }[];
  };
  add_to_pantry: { args: { p_items: PantryAddInput[] }; returns: number };
  set_pantry_item: {
    args: { p_item: string; p_level: PantryLevel | null; p_zone: Zone | null; p_expires_on: string | null; p_clear_expiry: boolean };
    returns: string;
  };
  set_pantry_quantity: { args: { p_item: string; p_quantity: number | null; p_unit: Unit | null }; returns: string };
  pantry_out: { args: { p_product: string; p_add_to_list: boolean }; returns: string | null };
  set_always_have: { args: { p_product: string; p_value: boolean }; returns: null };
  always_have_list: { args: Record<string, never>; returns: { product_id: string; name: string; category: Category; is_out: boolean }[] };
  apply_pantry_proposal: {
    args: { p_proposal_id: string; p_line_ids: string[]; p_edits: { id: string; quantity: number | null; unit: Unit | null }[] };
    returns: number;
  };
  dismiss_pantry_proposal: { args: { p_proposal_id: string }; returns: null };
}

/**
 * One thing to put in the pantry (add_to_pantry). A label without product_id becomes a household product.
 * `dated`: keeps for the product's shelf life from today (typed, likely fresh); otherwise no date.
 */
export interface PantryAddInput {
  product_id?: string | null;
  label?: string;
  category?: Category;
  zone?: Zone;
  quantity?: number | null;
  unit?: Unit | null;
  dated?: boolean;
}

/** Where one bought item goes and until when (null = keeps), for complete_shopping. */
export interface PutAwayChoice {
  id: string;
  zone: Zone;
  expires_on: string | null;
}

export type RpcName = keyof RpcMap;

export async function rpc<K extends RpcName>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['returns']> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as RpcMap[K]['returns'];
}
