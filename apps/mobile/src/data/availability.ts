// What a recipe needs against what is at home, ingredient by ingredient (recipe detail).
// The rule lives in SQL (ingredient_availability → pantry_has): staples count until marked out,
// food past its date for 3+ days doesn't. Optional ingredients don't count. Each line gets its mark, but the
// counts take a product once, however many sections use it (dark soy sauce in the marinade and the sauce),
// like recipe_needs in SQL: what planning puts on the list and what Ideas say is left to buy.
import { pictoOf, type Category, type Picto } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCatalog } from './catalog';
import { availabilityKey } from './keys';
import type { RecipeDetail } from './recipes';
import { rpc } from './rpc';

export interface IngredientAvailability {
  category: Category;
  picto: Picto;
  productId: string | null;
  /** Undefined while loading, and for optional ingredients that are not at home. */
  status?: 'have' | 'buy';
  soon: boolean;
}

export interface RecipeAvailability {
  /** By ingredient id. */
  byId: Map<string, IngredientAvailability>;
  /** What the recipe needs that is at home (staples included): a product once, a line without one each. */
  have: number;
  /** What the recipe needs (non-optional lines): a product once, a line without one each. */
  total: number;
  ready: boolean;
}

export function useRecipeAvailability(recipe: RecipeDetail | undefined): RecipeAvailability {
  const catalog = useCatalog();
  const query = useQuery({
    queryKey: availabilityKey(recipe?.id ?? ''),
    enabled: !!recipe,
    queryFn: () => rpc('ingredient_availability', { p_recipe_id: recipe!.id }),
  });
  return useMemo(() => {
    const products = new Map((catalog.data?.products ?? []).map((p) => [p.id, p]));
    const rows = new Map((query.data ?? []).map((r) => [r.ingredient_id, r]));
    const ready = !!query.data;
    const byId = new Map<string, IngredientAvailability>();
    // One need per product (or per line without one): at home or not.
    const needs = new Map<string, boolean>();
    for (const ing of recipe?.ingredients ?? []) {
      const row = rows.get(ing.id);
      const atHome = row?.at_home ?? false;
      const product = ing.product_id ? products.get(ing.product_id) : undefined;
      byId.set(ing.id, {
        category: product?.category ?? 'other',
        picto: pictoOf({ picto: product?.picto, category: product?.category ?? 'other' }),
        productId: ing.product_id,
        status: !ready || (ing.is_optional && !atHome) ? undefined : atHome ? 'have' : 'buy',
        soon: row?.soon ?? false,
      });
      if (!ing.is_optional) {
        const need = ing.product_id ?? ing.id;
        needs.set(need, (needs.get(need) ?? false) || atHome);
      }
    }
    const have = [...needs.values()].filter(Boolean).length;
    return { byId, have, total: needs.size, ready };
  }, [recipe, query.data, catalog.data]);
}

/** "You have 4 of 6 ingredients. 2 go on the list when you plan it." */
export function availabilityLine({ have, total }: Pick<RecipeAvailability, 'have' | 'total'>): string {
  const missing = total - have;
  if (total === 0) return '';
  if (missing === 0) return `You have all ${total} ingredients.`;
  return `You have ${have} of ${total} ingredients. ${missing} ${missing === 1 ? 'goes' : 'go'} on the list when you plan it.`;
}
