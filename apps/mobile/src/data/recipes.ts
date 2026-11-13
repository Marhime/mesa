import type { Recipe, RecipeIngredient, RecipeStep } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { formatMinutes, plural, sourceLine } from '../lib/text';
import { env } from './env';
import { useHouseholdId } from './household';
import { recipeKeys, recipesUsingKey } from './keys';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

export type RecipeSummary = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'servings'
  | 'total_minutes'
  | 'image_path'
  | 'is_favorite'
  | 'source_platform'
  | 'source_url'
  | 'created_at'
  | 'last_cooked_at'
>;

export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** The language it is written in (ISO 639-1, from the import), null when unknown or written by hand. */
  language: string | null;
}

export { recipeKeys };

/** Public URL of a recipe image (bucket path or absolute URL). */
export function recipeImageUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${env.supabaseUrl}/storage/v1/object/public/recipe-images/${path.replace(/^\/+/, '')}`;
}

/** "25 min · 4 servings". */
export function recipeMeta(r: Pick<Recipe, 'total_minutes' | 'servings'>): string {
  return [formatMinutes(r.total_minutes), plural(r.servings, 'serving', 'servings')].filter(Boolean).join(' · ');
}

export { formatMinutes, sourceLine };

// Reads ----------------------------------------------------------------------------

export function useRecipes() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: recipeKeys.list,
    enabled: !!householdId,
    queryFn: async (): Promise<RecipeSummary[]> =>
      must(
        await supabase
          .from('recipes')
          .select('id, title, servings, total_minutes, image_path, is_favorite, source_platform, source_url, created_at, last_cooked_at')
          .order('created_at', { ascending: false }),
      ) as RecipeSummary[],
  });
}

/** Ids of the recipes that use a product (Use soon → "what can I cook with it"). */
function useRecipeIdsUsing(productId: string | null) {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: recipesUsingKey(productId),
    enabled: !!householdId && !!productId,
    queryFn: async (): Promise<Set<string>> => {
      const rows = must(await supabase.from('recipe_ingredients').select('recipe_id').eq('product_id', productId!)) as { recipe_id: string }[];
      return new Set(rows.map((r) => r.recipe_id));
    },
  });
}

/** Favorites first, each group in the order it came (newest first). Pure. */
export function favoritesFirst<T extends Pick<RecipeSummary, 'is_favorite'>>(list: T[]): T[] {
  return [...list.filter((r) => r.is_favorite), ...list.filter((r) => !r.is_favorite)];
}

/** Recipes filtered by a search text, the Favorites chip and, optionally, a product they use; favorites first. */
export function useRecipeSearch(search: string, favoritesOnly: boolean, usingProductId: string | null = null) {
  const query = useRecipes();
  const using = useRecipeIdsUsing(usingProductId);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ids = usingProductId ? using.data : undefined;
    return favoritesFirst(
      (query.data ?? []).filter(
        (r) =>
          (!favoritesOnly || r.is_favorite) &&
          (q.length === 0 || r.title.toLowerCase().includes(q)) &&
          (!usingProductId || (ids?.has(r.id) ?? false)),
      ),
    );
  }, [query.data, search, favoritesOnly, usingProductId, using.data]);
  const { data, isError, refetch } = query;
  return { data, isError, refetch, isLoading: query.isLoading || (!!usingProductId && using.isLoading), results };
}

export function useRecipe(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: recipeKeys.detail(id ?? ''),
    enabled: !!id,
    placeholderData: () => {
      const summary = qc.getQueryData<RecipeSummary[]>(recipeKeys.list)?.find((r) => r.id === id);
      return summary ? ({ ...summary, ingredients: [], steps: [], language: null } as unknown as RecipeDetail) : undefined;
    },
    queryFn: async (): Promise<RecipeDetail> => {
      const row = must(
        await supabase
          .from('recipes')
          .select(
            'id, household_id, title, servings, total_minutes, source_url, source_platform, source_author, source_channel_url, source_channel_id, image_path, notes, is_favorite, last_cooked_at, created_at, updated_at, language:original->>language, recipe_ingredients(id, recipe_id, position, raw_text, name, product_id, quantity, unit, is_guessed, is_optional, section), recipe_steps(id, recipe_id, position, text, start_s)',
          )
          .eq('id', id!)
          .single(),
      ) as Omit<Recipe, 'original'> & { language: string | null; recipe_ingredients: RecipeIngredient[]; recipe_steps: RecipeStep[] };
      const { recipe_ingredients, recipe_steps, language, ...recipe } = row;
      return {
        ...recipe,
        original: null,
        language: language && /^[a-z]{2}$/i.test(language) ? language.toLowerCase() : null,
        ingredients: [...recipe_ingredients]
          .sort((a, b) => a.position - b.position)
          .map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) })),
        steps: [...recipe_steps].sort((a, b) => a.position - b.position),
      };
    },
  });
}

/** "From YouTube Shorts" for a recipe page (Shorts links say so). */
export function sourceLabel(r: Pick<Recipe, 'source_platform' | 'source_url'>): string | null {
  if (r.source_platform === 'youtube' && r.source_url && /\/shorts\//i.test(r.source_url)) return 'From YouTube Shorts';
  return sourceLine(r.source_platform, r.source_url);
}

// Writes ---------------------------------------------------------------------------

function patchRecipeCaches(qc: QueryClient, id: string, patch: Partial<RecipeSummary>) {
  qc.setQueryData<RecipeSummary[]>(recipeKeys.list, (list) => list?.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  qc.setQueryData<RecipeDetail>(recipeKeys.detail(id), (r) => (r ? { ...r, ...patch } : r));
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      must(await supabase.from('recipes').update({ is_favorite: favorite }).eq('id', id));
    },
    onMutate: ({ id, favorite }) => patchRecipeCaches(qc, id, { is_favorite: favorite }),
    onError: (_e, { id, favorite }) => patchRecipeCaches(qc, id, { is_favorite: !favorite }),
    onSettled: () => refresh(qc, 'favorite'),
  });
}
