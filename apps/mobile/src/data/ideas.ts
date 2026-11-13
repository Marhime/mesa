// "Tonight's idea" and what each recipe still needs, from recipe_coverage().
import type { RecipeCoverage } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useHouseholdId } from './household';
import { COVERAGE_KEY } from './keys';
import { recipeImageUrl, useRecipes, type RecipeSummary } from './recipes';
import { rpc } from './rpc';

/** Coverage by recipe id. */
export function useRecipeCoverage() {
  const householdId = useHouseholdId();
  const { data, isLoading, refetch } = useQuery({ queryKey: COVERAGE_KEY, enabled: !!householdId, queryFn: () => rpc('recipe_coverage', {}) });
  const byRecipe = useMemo(() => new Map((data ?? []).map((c) => [c.recipe_id, c])), [data]);
  return { byRecipe, isLoading, refetch };
}

/** A recipe cooked this recently is not suggested again first. */
const RECENT_MS = 3 * 86_400_000;
/** A favorite counts as needing this many fewer things to buy: it wins close calls, not every call. */
const FAVORITE_BONUS = 2;

/**
 * Best idea first: uses what should go soon, then needs the least shopping (a favorite as if it needed
 * FAVORITE_BONUS fewer), then is a favorite, then uses the most of what is at home; recently cooked
 * recipes go last. Pure.
 */
export function rankIdeas(recipes: RecipeSummary[], coverage: ReadonlyMap<string, RecipeCoverage>, now: number = Date.now()) {
  const recent = (r: RecipeSummary) => r.last_cooked_at !== null && now - Date.parse(r.last_cooked_at) < RECENT_MS;
  const shopping = (i: { recipe: RecipeSummary; coverage: RecipeCoverage }) =>
    i.coverage.need_count - (i.recipe.is_favorite ? FAVORITE_BONUS : 0);
  return recipes
    .flatMap((recipe) => {
      const c = coverage.get(recipe.id);
      return c ? [{ recipe, coverage: c }] : [];
    })
    .sort(
      (a, b) =>
        Number(recent(a.recipe)) - Number(recent(b.recipe)) ||
        b.coverage.soon_names.length - a.coverage.soon_names.length ||
        shopping(a) - shopping(b) ||
        Number(b.recipe.is_favorite) - Number(a.recipe.is_favorite) ||
        b.coverage.pantry_count - a.coverage.pantry_count,
    );
}

export interface IdeaView {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  minutes: number | null;
  sticker: string | undefined;
  text: string | undefined;
  shopping: string;
}

function listNames(names: string[]): string {
  const lower = names.map((n) => n.toLowerCase());
  if (lower.length <= 1) return lower.join('');
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

/** "2 to buy" / "All at home". */
export function shoppingLine(c: Pick<RecipeCoverage, 'need_count'>): string {
  return c.need_count === 0 ? 'All at home' : `${c.need_count} to buy`;
}

export function ideaView(recipe: RecipeSummary, c: RecipeCoverage): IdeaView {
  const soon = c.soon_names.slice(0, 3);
  return {
    recipeId: recipe.id,
    title: recipe.title,
    imageUrl: recipeImageUrl(recipe.image_path),
    minutes: recipe.total_minutes,
    sticker: c.pantry_count > 0 ? `Uses ${c.pantry_count} ${c.pantry_count === 1 ? 'thing' : 'things'} you have` : undefined,
    text:
      soon.length > 0
        ? `Uses your ${listNames(soon)} before ${soon.length === 1 ? 'it turns' : 'they turn'}.`
        : c.need_count === 0
          ? 'Everything is already at home.'
          : recipe.is_favorite
            ? 'One of your favorites.'
            : undefined,
    shopping: shoppingLine(c),
  };
}

/** Ranked ideas for Home ("Another idea" walks through them). */
export function useIdeas() {
  const recipes = useRecipes();
  const coverage = useRecipeCoverage();
  const ideas = useMemo(
    () => rankIdeas(recipes.data ?? [], coverage.byRecipe).map(({ recipe, coverage: c }) => ideaView(recipe, c)),
    [recipes.data, coverage.byRecipe],
  );
  return { ideas, isLoading: recipes.isLoading || coverage.isLoading };
}
