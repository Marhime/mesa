// Favorites at work: the heart on a recipe (and the one-time word on where they go), and "Cook again"
// on Home: favorites nobody has cooked lately.
import { useMemo } from 'react';

import { recentDayName } from '../lib/days';
import { friendlyError } from './errors';
import { recipeImageUrl, recipeMeta, useRecipes, useToggleFavorite, type RecipeSummary } from './recipes';
import { TIP, useTip } from './tips';

/** Cooked within this long: not "Cook again" yet. */
const COOK_AGAIN_AFTER_MS = 14 * 86_400_000;
const MAX_COOK_AGAIN = 6;

/** What the heart says: an error, or, the first time it is set on this phone, where favorites go. */
export type FavoriteNotice = { message: string; tone?: 'error' };

/** The heart on a recipe: `toggle(recipe)` sets or clears it (at once, back if the write fails). */
export function useFavoriteHeart(notify: (notice: FavoriteNotice) => void) {
  const { mutate } = useToggleFavorite();
  const tip = useTip(TIP.cookAgain);
  return (recipe: Pick<RecipeSummary, 'id' | 'is_favorite'>) => {
    const favorite = !recipe.is_favorite;
    mutate(
      { id: recipe.id, favorite },
      {
        onSuccess: () => {
          if (!favorite || !tip.visible) return;
          tip.dismiss();
          notify({ message: "Saved to Favorites · You'll see it in Cook again" });
        },
        onError: (e) => notify({ message: friendlyError(e, "Couldn't save that. Try again."), tone: 'error' }),
      },
    );
  };
}

export interface CookAgainView {
  key: string;
  title: string;
  imageUrl: string | null;
  /** "Last cooked Oct 12", or "25 min · 4 servings" when never cooked. */
  meta: string | undefined;
}

/**
 * Favorites not cooked in the last two weeks: the ones cooked longest ago first, then those never
 * cooked (newest first). At most six. Pure.
 */
export function cookAgain(recipes: RecipeSummary[], now: Date = new Date()): CookAgainView[] {
  const cookedAt = (r: RecipeSummary) => (r.last_cooked_at ? Date.parse(r.last_cooked_at) : null);
  const due = recipes.filter((r) => {
    const at = cookedAt(r);
    return r.is_favorite && (at === null || now.getTime() - at >= COOK_AGAIN_AFTER_MS);
  });
  const cooked = due.filter((r) => cookedAt(r) !== null).sort((a, b) => cookedAt(a)! - cookedAt(b)!);
  const never = due.filter((r) => cookedAt(r) === null);
  return [...cooked, ...never].slice(0, MAX_COOK_AGAIN).map((r) => ({
    key: r.id,
    title: r.title,
    imageUrl: recipeImageUrl(r.image_path),
    meta: r.last_cooked_at ? `Last cooked ${recentDayName(r.last_cooked_at, now).name}` : recipeMeta(r) || undefined,
  }));
}

/** "Cook again" on Home; empty (hidden) until a favorite is due. */
export function useCookAgain(): CookAgainView[] {
  const recipes = useRecipes();
  return useMemo(() => cookAgain(recipes.data ?? []), [recipes.data]);
}
