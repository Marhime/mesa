// What a recipe needs against what is at home, ingredient by ingredient (recipe detail).
// The rule lives in SQL (ingredient_availability → pantry_has): staples count until marked out,
// food past its date for 3+ days doesn't. Optional ingredients don't count.
import type { Category } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCatalog } from './catalog';
import { AVAILABILITY_KEY } from './keys';
import type { RecipeDetail } from './recipes';
import { rpc } from './rpc';

export interface IngredientAvailability {
  category: Category;
  productId: string | null;
  /** Undefined while loading, and for optional ingredients that are not at home. */
  status?: 'have' | 'buy';
  soon: boolean;
}

export interface RecipeAvailability {
  /** By ingredient id. */
  byId: Map<string, IngredientAvailability>;
  /** Non-optional ingredients at home (staples included). */
  have: number;
  /** Non-optional ingredients. */
  total: number;
  ready: boolean;
}

export function useRecipeAvailability(recipe: RecipeDetail | undefined): RecipeAvailability {
  const catalog = useCatalog();
  const query = useQuery({
    queryKey: [...AVAILABILITY_KEY, recipe?.id ?? ''],
    enabled: !!recipe,
    queryFn: () => rpc('ingredient_availability', { p_recipe_id: recipe!.id }),
  });
  return useMemo(() => {
    const products = new Map((catalog.data?.products ?? []).map((p) => [p.id, p]));
    const rows = new Map((query.data ?? []).map((r) => [r.ingredient_id, r]));
    const ready = !!query.data;
    const byId = new Map<string, IngredientAvailability>();
    let have = 0;
    let total = 0;
    for (const ing of recipe?.ingredients ?? []) {
      const row = rows.get(ing.id);
      const atHome = row?.at_home ?? false;
      byId.set(ing.id, {
        category: (ing.product_id ? products.get(ing.product_id)?.category : undefined) ?? 'other',
        productId: ing.product_id,
        status: !ready || (ing.is_optional && !atHome) ? undefined : atHome ? 'have' : 'buy',
        soon: row?.soon ?? false,
      });
      if (!ing.is_optional) {
        total += 1;
        if (atHome) have += 1;
      }
    }
    return { byId, have, total, ready };
  }, [recipe, query.data, catalog.data]);
}

/** "You have 4 of 6 ingredients. 2 go on the list when you plan it." */
export function availabilityLine({ have, total }: Pick<RecipeAvailability, 'have' | 'total'>): string {
  const missing = total - have;
  if (total === 0) return '';
  if (missing === 0) return `You have all ${total} ingredients.`;
  return `You have ${have} of ${total} ingredients. ${missing} ${missing === 1 ? 'goes' : 'go'} on the list when you plan it.`;
}
