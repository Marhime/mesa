// Pantry corrections as the screens say them: each one a toast (`notify`), every removal with Undo, which
// puts the rows back as they were and takes off the list what it had put there. Writes whose failure says
// so itself (meta.errorMessage) get no second toast here.
import type { PantryLevel, Unit } from '@mesa/shared';
import { useQueryClient } from '@tanstack/react-query';

import { isoInDays } from '../lib/days';
import { useDeleteItem } from './groceries';
import type { GroceryLine } from './groceryCache';
import { GROCERIES_KEY } from './keys';
import { notifyError, undoNotice, type Notify } from './notice';
import type { PantryEntry } from './pantry';
import { pantryRowsOf, useAddToPantry, usePantryOut, useRestorePantry, useSetPantryItem, useSetPantryQuantity, type PantryRestore } from './pantryWrites';

const FAILED = "Couldn't save that. Try again.";

export function usePantryActions(notify: Notify) {
  const qc = useQueryClient();
  const setItem = useSetPantryItem();
  const setQuantity = useSetPantryQuantity();
  const { mutate: out } = usePantryOut();
  const { mutate: add } = useAddToPantry();
  const { mutate: restore } = useRestorePantry();
  const { mutate: removeLine } = useDeleteItem();
  const fail = (e: unknown) => notifyError(notify, e, FAILED);

  /** On the list to buy already: "out" merges into that line, and Undo leaves it there. */
  const listed = (productId: string) =>
    (qc.getQueryData<GroceryLine[]>(GROCERIES_KEY) ?? []).some((l) => l.product_id === productId && l.status === 'to_buy');

  /**
   * Out of the pantry (and onto the list when `toList`), said with Undo. A product with no row (a staple,
   * counted at home without one) gets its "out" row taken away again.
   */
  const takeOut = (productId: string, message: string, toList: boolean) => {
    const before: PantryRestore = { productId, rows: pantryRowsOf(qc, productId), without: 'none' };
    const wasListed = toList && listed(productId);
    out(
      { productId, addToList: toList },
      {
        onSuccess: (lineId) =>
          notify(
            message,
            undoNotice(() => {
              restore(before);
              if (lineId && !wasListed) removeLine({ id: lineId });
            }),
          ),
        onError: fail,
      },
    );
  };

  /** Used up: out of the pantry, back on the list. */
  const runOut = (e: PantryEntry) => takeOut(e.product_id, `${e.name} is out · on your list`, true);

  return {
    /** A level; "out" (the sheet's "Ran out") takes it out of the pantry and onto the list, with Undo. */
    setLevel: (e: PantryEntry, level: PantryLevel) => (level === 'out' ? runOut(e) : setItem.mutate({ id: e.id, level })),
    /** A typed amount; 0 means it ran out (back on the list, with Undo). */
    setAmount: (e: PantryEntry, amount: { quantity: number | null; unit: Unit | null }) =>
      amount.quantity === 0 ? runOut(e) : setQuantity.mutate({ id: e.id, ...amount }),
    setKeeps: (e: PantryEntry, days: number | null) => setItem.mutate({ id: e.id, expiresOn: days === null ? null : isoInDays(days) }),
    /** Past its date but fine: three more days. */
    stillGood: (e: PantryEntry) => setItem.mutate({ id: e.id, expiresOn: isoInDays(3) }),
    /** Past its date and gone: out of the pantry, with Undo. */
    gone: (e: PantryEntry) => takeOut(e.product_id, `Took ${e.name.toLowerCase()} out of the pantry`, false),
    /** "I have it" (a recipe's To buy, a search miss): in the pantry without a date; Undo takes it back out. */
    have: (productId: string, name: string) => {
      const before: PantryRestore = { productId, rows: pantryRowsOf(qc, productId), without: 'out' };
      add([{ product_id: productId }], {
        onSuccess: () => notify(`${name} added to pantry`, undoNotice(() => restore(before))),
        onError: fail,
      });
    },
    staple: {
      /** A staple ran out: on the list, with Undo. */
      out: (productId: string, name: string) => takeOut(productId, `${name} is on your list`, true),
      back: (productId: string) => add([{ product_id: productId }], { onError: fail }),
    },
  };
}
