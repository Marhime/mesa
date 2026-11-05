import {
  capitalize,
  formatQuantity,
  matchProduct,
  parseIngredientLine,
  scaleQuantity,
  type CatalogIndex,
  type Recipe,
  type RecipeIngredient,
  type RecipeStep,
} from '@mesa/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { formatMinutes, plural, sourceLine } from '../lib/text';
import { env } from './env';
import { useHouseholdId } from './household';
import { must, supabase } from './supabase';

export type RecipeSummary = Pick<
  Recipe,
  'id' | 'title' | 'servings' | 'total_minutes' | 'image_path' | 'is_favorite' | 'source_platform' | 'created_at' | 'last_cooked_at'
>;

export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export const recipeKeys = {
  list: ['recipes'] as const,
  detail: (id: string) => ['recipe', id] as const,
};

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
          .select('id, title, servings, total_minutes, image_path, is_favorite, source_platform, created_at, last_cooked_at')
          .order('created_at', { ascending: false }),
      ) as RecipeSummary[],
  });
}

/** Ids of the recipes that use a product (Use soon → "what can I cook with it"). */
function useRecipeIdsUsing(productId: string | null) {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: ['recipesUsing', productId],
    enabled: !!householdId && !!productId,
    queryFn: async (): Promise<Set<string>> => {
      const rows = must(await supabase.from('recipe_ingredients').select('recipe_id').eq('product_id', productId!)) as { recipe_id: string }[];
      return new Set(rows.map((r) => r.recipe_id));
    },
  });
}

/** Recipes filtered by a search text, the Favorites chip and, optionally, a product they use. */
export function useRecipeSearch(search: string, favoritesOnly: boolean, usingProductId: string | null = null) {
  const query = useRecipes();
  const using = useRecipeIdsUsing(usingProductId);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ids = usingProductId ? using.data : undefined;
    return (query.data ?? []).filter(
      (r) =>
        (!favoritesOnly || r.is_favorite) &&
        (q.length === 0 || r.title.toLowerCase().includes(q)) &&
        (!usingProductId || (ids?.has(r.id) ?? false)),
    );
  }, [query.data, search, favoritesOnly, usingProductId, using.data]);
  return { ...query, isLoading: query.isLoading || (!!usingProductId && using.isLoading), results };
}

export function useRecipe(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: recipeKeys.detail(id ?? ''),
    enabled: !!id,
    placeholderData: () => {
      const summary = qc.getQueryData<RecipeSummary[]>(recipeKeys.list)?.find((r) => r.id === id);
      return summary ? ({ ...summary, ingredients: [], steps: [] } as unknown as RecipeDetail) : undefined;
    },
    queryFn: async (): Promise<RecipeDetail> => {
      const row = must(
        await supabase
          .from('recipes')
          .select(
            'id, household_id, title, servings, total_minutes, source_url, source_platform, image_path, notes, is_favorite, last_cooked_at, created_at, updated_at, recipe_ingredients(id, recipe_id, position, raw_text, name, product_id, quantity, unit, is_guessed, is_optional), recipe_steps(id, recipe_id, position, text)',
          )
          .eq('id', id!)
          .single(),
      ) as Omit<Recipe, 'original'> & { recipe_ingredients: RecipeIngredient[]; recipe_steps: RecipeStep[] };
      const { recipe_ingredients, recipe_steps, ...recipe } = row;
      return {
        ...recipe,
        original: null,
        ingredients: [...recipe_ingredients]
          .sort((a, b) => a.position - b.position)
          .map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) })),
        steps: [...recipe_steps].sort((a, b) => a.position - b.position),
      };
    },
  });
}

export interface IngredientView {
  id: string;
  name: string;
  quantity: string;
  estimated: boolean;
  optional: boolean;
}

/** "From YouTube Shorts" for a recipe page (Shorts links say so). */
export function sourceLabel(r: Pick<Recipe, 'source_platform' | 'source_url'>): string | null {
  if (r.source_platform === 'youtube' && r.source_url && /\/shorts\//i.test(r.source_url)) return 'From YouTube Shorts';
  return sourceLine(r.source_platform, r.source_url);
}

/** Ingredients scaled from the recipe's servings to `servings`, formatted for display. */
export function scaledIngredients(recipe: RecipeDetail, servings: number): IngredientView[] {
  return recipe.ingredients.map((i) => ({
    id: i.id,
    name: capitalize(i.name),
    quantity: formatQuantity(scaleQuantity(i.quantity, recipe.servings, servings), i.unit),
    estimated: i.is_guessed,
    optional: i.is_optional,
  }));
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
    onSettled: () => qc.invalidateQueries({ queryKey: recipeKeys.list }),
  });
}

export interface RecipeDraft {
  title: string;
  servings: number;
  minutes: string;
  ingredients: string;
  steps: string;
}

/** Editor fields for an existing recipe (one ingredient / step per line). */
export function draftFromRecipe(r: RecipeDetail | undefined, defaultServings: number): RecipeDraft {
  if (!r) return { title: '', servings: defaultServings, minutes: '', ingredients: '', steps: '' };
  return {
    title: r.title,
    servings: r.servings,
    minutes: r.total_minutes ? String(r.total_minutes) : '',
    ingredients: r.ingredients.map((i) => i.raw_text).join('\n'),
    steps: r.steps.map((s) => s.text).join('\n'),
  };
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*]\s*|\d+[.)]\s+)/, '').trim())
    .filter((l) => l.length > 0);
}

function ingredientRows(recipeId: string, text: string, index: CatalogIndex | null, previous: RecipeDetail | undefined) {
  return lines(text).map((line, position) => {
    // An untouched line keeps what the import knew (estimated amounts, optional flags).
    const kept = previous?.ingredients.find((i) => i.raw_text.trim() === line);
    if (kept) {
      const { id: _id, recipe_id: _r, position: _p, ...rest } = kept;
      return { ...rest, recipe_id: recipeId, position };
    }
    const parsed = parseIngredientLine(line);
    const name = parsed.label || line;
    const product = index ? matchProduct(index, name) : null;
    return {
      recipe_id: recipeId,
      position,
      raw_text: line,
      name,
      product_id: product?.id ?? null,
      quantity: parsed.quantity,
      unit: parsed.unit,
      is_guessed: false,
      is_optional: false,
    };
  });
}

/**
 * Replaces a recipe's ingredients or steps: the new rows go in first and only then the old ones
 * are deleted, so a failed save never leaves the recipe empty (retrying converges).
 */
async function replaceChildren(table: 'recipe_ingredients' | 'recipe_steps', recipeId: string, rows: object[]): Promise<void> {
  const old = must(await supabase.from(table).select('id').eq('recipe_id', recipeId)) as { id: string }[];
  if (rows.length > 0) must(await supabase.from(table).insert(rows));
  if (old.length > 0) must(await supabase.from(table).delete().in('id', old.map((r) => r.id)));
}

/** Creates or edits a recipe; ingredients and steps are replaced. `recipes.original` is never touched. */
export function useSaveRecipe(index: CatalogIndex | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, previous }: { draft: RecipeDraft; previous?: RecipeDetail }): Promise<string> => {
      const minutes = Number.parseInt(draft.minutes, 10);
      const fields = {
        title: draft.title.trim(),
        servings: draft.servings,
        total_minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      };
      let id = previous?.id;
      if (id) {
        must(await supabase.from('recipes').update(fields).eq('id', id));
      } else {
        const row = must(await supabase.from('recipes').insert({ ...fields, source_platform: 'manual' }).select('id').single()) as { id: string };
        id = row.id;
      }
      const recipeId = id;
      await replaceChildren('recipe_ingredients', recipeId, ingredientRows(recipeId, draft.ingredients, index, previous));
      await replaceChildren('recipe_steps', recipeId, lines(draft.steps).map((text, position) => ({ recipe_id: recipeId, position, text })));
      return recipeId;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: recipeKeys.list });
      void qc.invalidateQueries({ queryKey: recipeKeys.detail(id) });
    },
  });
}
