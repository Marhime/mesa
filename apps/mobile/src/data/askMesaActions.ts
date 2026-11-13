// What Ask Mesa's answers offer to do: put things on the list, plan a recipe (each with a toast and Undo,
// like everywhere else), open a recipe, plan the week. Nothing happens until the person taps it (the
// videos an answer looks for are not a button: askFinds.ts).
import { matchProduct } from '@mesa/shared';
import { useCallback, useMemo, useState } from 'react';

import type { AskAction } from './askAnswer';
import { useCatalogIndex } from './catalog';
import { useAddGroceries } from './groceryAdd';
import type { AddInput } from './groceryMutations';
import { notifyError, undoNotice, type Notify } from './notice';
import { usePlanWithUndo } from './planWithUndo';

export interface AskActionsOptions {
  notify: Notify;
  /** Opens a recipe (the sheet leaves first). */
  onOpenRecipe: (recipeId: string) => void;
  /** Plan my week, these wishes filled in (null: any week). */
  onPlanWeek: (wishes: string | null) => void;
}

/** What an action's button says once done ("Added to your list"); null for those that are never done. */
const DONE_LABEL: Partial<Record<AskAction['kind'], string>> = { add_to_list: 'Added to your list', plan: 'On the menu' };

/**
 * Runs an answer's actions. `id` names one action of one answer: what is done (or under way) stays
 * so on its button; Undo makes it doable again.
 */
export function useAskActions({ notify, onOpenRecipe, onPlanWeek }: AskActionsOptions) {
  const index = useCatalogIndex();
  const { add } = useAddGroceries();
  const planner = usePlanWithUndo(notify);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const mark = (id: string, on: boolean) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toList = (items: Extract<AskAction, { kind: 'add_to_list' }>['items']): AddInput[] =>
    items.map((item) => {
      const product = index ? matchProduct(index, item.label) : null;
      return { label: item.label, product_id: product?.id ?? null, quantity: item.quantity, unit: item.unit, category: product?.category ?? 'other' };
    });

  const run = (id: string, action: AskAction) => {
    if (done.has(id) || busy) return;
    switch (action.kind) {
      case 'add_to_list': {
        const result = add(toList(action.items), 'manual', (e) => {
          mark(id, false);
          notifyError(notify, e, "Couldn't add them. Try again.");
        });
        mark(id, true);
        notify(
          result.message,
          undoNotice(() => {
            result.undo();
            mark(id, false);
          }),
        );
        return;
      }
      case 'plan':
        setBusy(id);
        planner.plan(action.recipeId, {
          onPlanned: () => mark(id, true),
          onUndone: () => mark(id, false),
          onSettled: () => setBusy(null),
        });
        return;
      case 'open_recipe':
        return onOpenRecipe(action.recipeId);
      case 'plan_week':
        return onPlanWeek(action.wishes);
    }
  };

  /** What is done, to keep with the conversation. */
  const doneIds = useMemo(() => [...done], [done]);
  /** A kept conversation comes back with what was done. */
  const restore = useCallback((ids: readonly string[]) => setDone(new Set(ids)), []);
  /** A new conversation: nothing is done any more. */
  const reset = useCallback(() => setDone(new Set()), []);

  return {
    run,
    /** The button's state and words. */
    status: (id: string, action: AskAction) => {
      const isDone = done.has(id);
      return { done: isDone, busy: busy === id, label: (isDone ? DONE_LABEL[action.kind] : null) ?? action.label };
    },
    doneIds,
    restore,
    reset,
  };
}
