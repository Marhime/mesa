// "Cooked!": takes the ingredients out of the pantry (cook_recipe) and keeps what it took for the Cooked screen.
import { capitalize, formatQuantity, type Category, type CookedIngredient, type Picto } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cookedKey } from './keys';
import { refresh } from './refresh';
import { rpc } from './rpc';

export interface CookedResult {
  recipeId: string;
  title: string;
  items: CookedIngredient[];
}

export function useCookRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, title, servings }: { recipeId: string; title: string; servings: number }): Promise<CookedResult> => {
      const rows = await rpc('cook_recipe', { p_recipe_id: recipeId, p_servings: servings });
      const num = (v: number | null) => (v === null ? null : Number(v));
      const items = (rows ?? []).map((r) => ({ ...r, used: num(r.used), left_quantity: num(r.left_quantity) }));
      return { recipeId, title, items };
    },
    onSuccess: (result) => qc.setQueryData(cookedKey(result.recipeId), result),
    // The pantry it used and all that is computed from it, what ran out (the list), the menu, last cooked.
    onSettled: () => refresh(qc, 'cooked'),
  });
}

/** What the last cook of this recipe took (kept in memory until the app restarts). */
export function useCookedResult(recipeId: string | undefined): CookedResult | undefined {
  const { data } = useQuery<CookedResult | null>({
    queryKey: cookedKey(recipeId ?? ''),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? undefined;
}

export interface CookedRowView {
  key: string;
  name: string;
  picto: Picto;
  detail: string;
  ranOut: boolean;
  /** "−375 g", "0" when it ran out, "" when the amount is unknown. */
  delta: string;
}

function leftText(item: CookedIngredient): string {
  if (item.left_quantity !== null) return `${formatQuantity(item.left_quantity, item.unit) || item.left_quantity} left`;
  if (item.left_level === 'half') return 'About half left';
  if (item.left_level === 'low') return 'A little left';
  return 'Some left';
}

/** Rows of "Taken from your pantry". Pure; `pictoFor` is usePictoLookup(). */
export function cookedRows(items: CookedIngredient[], pictoFor: (productId: string, category: Category) => Picto): CookedRowView[] {
  return items.map((item) => ({
    key: item.product_id,
    name: capitalize(item.label),
    picto: pictoFor(item.product_id, item.category),
    ranOut: item.ran_out,
    detail: item.ran_out ? 'Ran out · added to your list' : item.saved ? `Used before it turned · ${leftText(item)}` : leftText(item),
    delta: item.ran_out ? '0' : item.used !== null && item.used > 0 ? `−${formatQuantity(item.used, item.unit) || item.used}` : '',
  }));
}

/** "Tinga is done!" — the recipe's first words keep it short. */
export function doneTitle(title: string): string {
  const words = title.trim().split(/\s+/);
  const short = words.length > 3 ? words.slice(0, 3).join(' ') : title.trim();
  return `${short} is done!`;
}
