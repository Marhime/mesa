import type { Recipe, RecipeCoverage, UpNext } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GROCERIES_KEY } from './groceries';
import { useHouseholdId } from './household';
import { recipeImageUrl } from './recipes';
import { rpc } from './rpc';
import { must, supabase } from './supabase';

export interface UpNextEntry extends Pick<UpNext, 'id' | 'recipe_id' | 'servings' | 'created_at'> {
  recipe: Pick<Recipe, 'id' | 'title' | 'image_path' | 'servings'> | null;
}

export const UP_NEXT_KEY = ['upNext'] as const;
const KEY = UP_NEXT_KEY;

export function useUpNext() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<UpNextEntry[]> => {
      const rows = must(
        await supabase
          .from('up_next')
          .select('id, recipe_id, servings, created_at, recipes(id, title, image_path, servings)')
          .order('created_at', { ascending: true }),
      ) as unknown as (Omit<UpNextEntry, 'recipe'> & { recipes: UpNextEntry['recipe'] })[];
      return rows.map(({ recipes, ...rest }) => ({ ...rest, recipe: recipes }));
    },
  });
}

export interface UpNextTileView {
  title: string;
  imageUrl: string | null;
  seed: string;
  status?: { icon: 'checkCircle' | 'store'; text: string; tone: 'success' | 'muted' };
}

/** Display fields for an Up next tile: is everything at home? */
export function upNextTileData(entry: UpNextEntry, coverage: RecipeCoverage | undefined): UpNextTileView {
  return {
    title: entry.recipe?.title ?? 'Recipe',
    imageUrl: recipeImageUrl(entry.recipe?.image_path ?? null),
    seed: entry.recipe_id,
    status: !coverage
      ? undefined
      : coverage.need_count === 0
        ? { icon: 'checkCircle', text: 'All at home', tone: 'success' }
        : { icon: 'store', text: `${coverage.need_count} to buy`, tone: 'muted' },
  };
}

/** "Plan it": adds the recipe to Up next and its ingredients to the list. Returns how many lines it touched. */
export function usePlanRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, servings }: { recipeId: string; servings?: number }) => {
      const upNextId = await rpc('plan_recipe', { p_recipe_id: recipeId, p_servings: servings ?? null });
      const { count } = await supabase
        .from('grocery_item_recipes')
        .select('grocery_item_id', { count: 'exact', head: true })
        .eq('up_next_id', upNextId);
      return { upNextId, items: count ?? 0 };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: GROCERIES_KEY });
    },
  });
}

/** Takes a recipe out of Up next and removes what only it had added to the list. */
export function useUnplan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upNextId: string) => rpc('unplan', { p_up_next_id: upNextId }),
    onMutate: async (upNextId) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<UpNextEntry[]>(KEY);
      qc.setQueryData<UpNextEntry[]>(KEY, (list) => list?.filter((e) => e.id !== upNextId));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: GROCERIES_KEY });
    },
  });
}
