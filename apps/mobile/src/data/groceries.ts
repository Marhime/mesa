// The shared grocery list: reading it (by aisle, live), checking, editing, removing, Done shopping, and the
// usual picks. Adding lives in groceryAdd.ts, the cache plumbing in groceryCache.ts, row text in groceryRows.ts.
import { AISLE_ORDER, matchProduct, type CatalogIndex, type Category, type Unit } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import { useCatalog } from './catalog';
import { USUAL_KEY, fetchGroceries, invalidateWhenIdle, setLines, type GroceryLine } from './groceryCache';
import { groceryMutationKeys, type AddInput, type ItemEditVars } from './groceryMutations';
import { toListItem } from './groceryRows';
import { useHouseholdId } from './household';
import { GROCERIES_KEY, PANTRY_KEY } from './keys';
import { notifyError, undoNotice, type Notify } from './notice';
import type { PantryEntry } from './pantry';
import { pantryRowsOf, useRestorePantry } from './pantryWrites';
import { refresh } from './refresh';
import { rpc, type PutAwayChoice } from './rpc';

export { GROCERIES_KEY };
export { resolveId, isTempId, type AddInput } from './groceryMutations';
export type { GroceryLine } from './groceryCache';
export { lineQuantity } from './groceryRows';

const POLL_MS = 10_000;

// Reads -------------------------------------------------------------------------

export interface AisleGroup {
  category: Category;
  items: GroceryLine[];
}

/**
 * The shared list. With `live` (the list is on screen), it reads again as it comes on screen and every
 * 10 s while it stays there.
 */
export function useGroceries({ live = false }: { live?: boolean } = {}) {
  const householdId = useHouseholdId();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: GROCERIES_KEY,
    queryFn: fetchGroceries,
    enabled: !!householdId,
    refetchInterval: () => (live && qc.isMutating({ mutationKey: GROCERIES_KEY }) === 0 ? POLL_MS : false),
  });

  const { data, isLoading, isError, refetch } = query;
  useEffect(() => {
    if (live && householdId) void refetch();
  }, [live, householdId, refetch]);

  const view = useMemo(() => {
    const lines = query.data ?? [];
    const toBuy = lines.filter((l) => l.status === 'to_buy');
    const inCart = lines
      .filter((l) => l.status === 'in_cart')
      .sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''));
    const aisles: AisleGroup[] = AISLE_ORDER.map((category) => ({
      category,
      items: toBuy.filter((l) => l.category === category),
    })).filter((g) => g.items.length > 0);
    const byKey = new Map(lines.map((l) => [l.key, l]));
    // Display rows for the GroceryList organism.
    const listAisles = aisles.map((a) => ({ category: a.category, items: a.items.map(toListItem) }));
    const listCart = inCart.map(toListItem);
    return { lines, toBuy, inCart, byKey, listAisles, listCart };
  }, [query.data]);

  return { data, isLoading, isError, refetch, ...view };
}

/** Number of items to buy (tab badge, Home row). */
export function useToBuyCount(): number {
  const householdId = useHouseholdId();
  const { data } = useQuery({
    queryKey: GROCERIES_KEY,
    queryFn: fetchGroceries,
    enabled: !!householdId,
    select: (lines) => lines.filter((l) => l.status === 'to_buy').length,
  });
  return data ?? 0;
}

// Check, edit, remove --------------------------------------------------------------

function optimisticPatch(qc: QueryClient, id: string, patch: Partial<GroceryLine> | null) {
  setLines(qc, (lines) => (patch === null ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, ...patch } : l))));
}

/** Check (into the cart) or uncheck an item. */
export function useToggleItem() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; checked: boolean }, { prev: GroceryLine[] | undefined }>({
    mutationKey: groceryMutationKeys.toggle,
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY);
      optimisticPatch(qc, id, checked ? { status: 'in_cart', checked_at: new Date().toISOString() } : { status: 'to_buy', checked_at: null });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(GROCERIES_KEY, ctx.prev),
    onSettled: () => invalidateWhenIdle(qc),
  });
}

/** "Already have it": takes the item off the list and remembers it is at home. */
export function useMarkHave() {
  const qc = useQueryClient();
  return useMutation<void, Error, string, { prev: GroceryLine[] | undefined }>({
    mutationKey: groceryMutationKeys.have,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY);
      optimisticPatch(qc, id, null);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(GROCERIES_KEY, ctx.prev),
    onSettled: () => {
      invalidateWhenIdle(qc);
      refresh(qc, 'pantry');
    },
  });
}

/** The product a line went into the pantry as: its own, or the one made from its name (a row new since `before`). */
function stockedProduct(qc: QueryClient, line: GroceryLine, before: ReadonlySet<string>): string | null {
  if (line.product_id) return line.product_id;
  const name = line.label.trim().toLowerCase();
  return (qc.getQueryData<PantryEntry[]>(PANTRY_KEY) ?? []).find((e) => !before.has(e.product_id) && e.name.toLowerCase() === name)?.product_id ?? null;
}

/**
 * "Already have it" on a line, said with Undo: the line comes back as it was, and the pantry as it was
 * before (once the first write is through, so the two never cross).
 */
export function useAlreadyHave(notify: Notify) {
  const qc = useQueryClient();
  const { mutateAsync: have } = useMarkHave();
  const { mutate: putBack } = useDeleteItem();
  const { mutate: restore } = useRestorePantry();
  return (line: GroceryLine) => {
    const rows = line.product_id ? pantryRowsOf(qc, line.product_id) : [];
    const known = new Set((qc.getQueryData<PantryEntry[]>(PANTRY_KEY) ?? []).map((e) => e.product_id));
    const done = have(line.id);
    done.catch((e: unknown) => notifyError(notify, e, "Couldn't save that. Try again."));
    notify(
      `Noted, you have ${line.label}`,
      undoNotice(() => {
        putBack({ id: line.id, restore: line });
        void done
          .then(() => (line.product_id ? undefined : qc.refetchQueries({ queryKey: PANTRY_KEY, exact: true })))
          .then(() => {
            const productId = stockedProduct(qc, line, known);
            if (productId) restore({ productId, rows, without: 'out' });
          })
          .catch(() => undefined);
      }),
    );
  };
}

/** Deletes a line (soft: status 'removed', so Undo can bring it back). */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; restore?: GroceryLine }, { prev: GroceryLine[] | undefined }>({
    mutationKey: groceryMutationKeys.remove,
    onMutate: async ({ id, restore }) => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY);
      if (restore) setLines(qc, (lines) => [...lines.filter((l) => l.id !== id), restore].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      else optimisticPatch(qc, id, null);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(GROCERIES_KEY, ctx.prev),
    onSettled: () => invalidateWhenIdle(qc),
  });
}

export interface ItemEdit {
  id: string;
  label: string;
  quantity: number | null;
  unit: Unit | null;
  category: Category;
}

/** Saves the edit sheet. A renamed item is matched to the catalog again. */
export function useUpdateItem(index: CatalogIndex | null) {
  const qc = useQueryClient();
  const mutation = useMutation<void, Error, ItemEditVars, { prev: GroceryLine[] | undefined }>({
    mutationKey: groceryMutationKeys.update,
    meta: { errorMessage: "Couldn't save the change. It's back as it was." },
    onMutate: async (edit) => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY);
      optimisticPatch(qc, edit.id, {
        label: edit.label,
        quantity: edit.quantity,
        unit: edit.unit,
        category: edit.category,
        product_id: edit.productId,
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(GROCERIES_KEY, ctx.prev),
    onSettled: () => invalidateWhenIdle(qc),
  });

  const save = useCallback(
    (line: GroceryLine, edit: Omit<ItemEdit, 'id'>) => {
      const renamed = edit.label.trim().toLowerCase() !== line.label.trim().toLowerCase();
      const productId = renamed ? (index ? (matchProduct(index, edit.label)?.id ?? null) : null) : line.product_id;
      mutation.mutate({ id: line.id, productId, ...edit });
    },
    [index, mutation],
  );
  return { save, ...mutation };
}

/** "Done shopping": everything in the cart becomes bought and is put away as chosen (see shopping.ts). */
export function useCompleteShopping() {
  const qc = useQueryClient();
  return useMutation<number, Error, PutAwayChoice[], { prev: GroceryLine[] | undefined }>({
    mutationKey: groceryMutationKeys.complete,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY);
      setLines(qc, (lines) => lines.filter((l) => l.status !== 'in_cart'));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(GROCERIES_KEY, ctx.prev),
    onSettled: () => {
      invalidateWhenIdle(qc);
      refresh(qc, 'pantry');
    },
  });
}

// Usual ----------------------------------------------------------------------------

export interface UsualPick {
  product_id: string;
  name: string;
  category: Category;
}

/** Products bought most often (from usual_products), or a starter set for a new household. */
const STARTERS = ['Milk', 'Egg', 'Bread', 'Coffee'];

export function useUsualProducts(index: CatalogIndex | null) {
  const householdId = useHouseholdId();
  const { data: catalog } = useCatalog();
  const { lines } = useGroceries();
  const query = useQuery({
    queryKey: USUAL_KEY,
    enabled: !!householdId,
    queryFn: () => rpc('usual_products', { p_limit: 8 }),
  });

  const picks = useMemo<UsualPick[]>(() => {
    const onList = new Set(lines.map((l) => l.product_id).filter(Boolean));
    const usual = (query.data ?? []).map((u) => ({ product_id: u.product_id, name: u.name_en, category: u.category }));
    if (usual.length > 0) return usual.filter((u) => !onList.has(u.product_id));
    if (!index || !catalog) return [];
    return STARTERS.map((name) => matchProduct(index, name))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .filter((p) => !onList.has(p.id))
      .map((p) => ({ product_id: p.id, name: p.name_en, category: p.category }));
  }, [query.data, lines, index, catalog]);

  return { picks, isLoading: query.isLoading };
}

export function usualToInput(pick: UsualPick): AddInput {
  return { label: pick.name, product_id: pick.product_id, quantity: null, unit: null, category: pick.category };
}
