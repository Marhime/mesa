// "Plan it", wherever it is (Tonight's idea, a recipe, an Ask Mesa answer, Plan my week): the recipe goes on
// the menu and what is missing on the list, said in one toast with Undo, in the same words everywhere.
import { plural } from '../lib/text';
import { notifyError, undoNotice, type Notify } from './notice';
import { usePlanRecipe, useUnplan } from './upNext';

/** "On the menu · 2 items on your list", "On the menu · all at home". */
export function plannedLine(items: number): string {
  return items > 0 ? `On the menu · ${plural(items, 'item', 'items')} on your list` : 'On the menu · all at home';
}

/** "4 dinners on the menu · list updated" ("· all at home" when nothing was missing). */
export function plannedManyLine(dinners: number, items: number): string {
  return `${plural(dinners, 'dinner', 'dinners')} on the menu · ${items > 0 ? 'list updated' : 'all at home'}`;
}

export interface PlanOptions {
  /** How many it is for; the household's default when left out. */
  servings?: number;
  /** It is on the menu (a haptic, a button that says so). */
  onPlanned?: () => void;
  /** Undo took it off the menu again. */
  onUndone?: () => void;
  /** Planned or not. */
  onSettled?: () => void;
}

/** How "add them all" went: the recipes added, and the first that could not be (nothing after it was tried). */
export interface PlanAllResult {
  added: number;
  failed: { recipeId: string; title: string; error: unknown } | null;
}

export function usePlanWithUndo(notify: Notify) {
  const { mutate, mutateAsync, isPending } = usePlanRecipe();
  const { mutate: unplan } = useUnplan();

  return {
    planning: isPending,
    /** One recipe: a toast with Undo, or why it failed. */
    plan: (recipeId: string, options: PlanOptions = {}) =>
      mutate(
        { recipeId, servings: options.servings },
        {
          onSuccess: ({ upNextId, items }) => {
            options.onPlanned?.();
            notify(
              plannedLine(items),
              undoNotice(() => {
                unplan(upNextId);
                options.onUndone?.();
              }),
            );
          },
          onError: (e) => notifyError(notify, e, "Couldn't plan it. Try again."),
          onSettled: options.onSettled,
        },
      ),
    /**
     * Several recipes, one after the other (each fills the list); stops at the first that fails and says
     * nothing then (the caller shows which). All added: one toast, whose Undo takes them all off.
     */
    planAll: async (dinners: { recipeId: string; title: string }[], onEach?: (recipeId: string) => void): Promise<PlanAllResult> => {
      const planned: string[] = [];
      let items = 0;
      for (const d of dinners) {
        try {
          const r = await mutateAsync({ recipeId: d.recipeId });
          planned.push(r.upNextId);
          items += r.items;
          onEach?.(d.recipeId);
        } catch (error) {
          return { added: planned.length, failed: { recipeId: d.recipeId, title: d.title, error } };
        }
      }
      if (planned.length > 0) notify(plannedManyLine(planned.length, items), undoNotice(() => planned.forEach((id) => unplan(id))));
      return { added: planned.length, failed: null };
    },
  };
}
