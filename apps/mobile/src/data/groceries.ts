import {
  AISLE_ORDER,
  CATEGORY_LABEL,
  formatQuantity,
  matchProduct,
  type CatalogIndex,
  type Category,
  type GroceryItem,
  type GrocerySource,
  type Unit,
} from '@mesa/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useMemo } from 'react';

import type { ResolvedGroceryItem } from '../lib/groceryInput';
import { useCatalog } from './catalog';
import {
  groceryMutationKeys,
  rememberRealId,
  type AddInput,
  type AddVars,
  type ItemEditVars,
  type UndoStep,
} from './groceryMutations';
import { useHouseholdId } from './household';
import { GROCERIES_KEY, PANTRY_UPDATED_KEY, refreshPantryViews } from './keys';
import { rpc, type PutAwayChoice } from './rpc';
import { must, supabase } from './supabase';

export { GROCERIES_KEY };
export { resolveId, isTempId, type AddInput } from './groceryMutations';

/** A line on the list, with the recipes it is for and a key that survives the temp → real id swap. */
export interface GroceryLine extends GroceryItem {
  key: string;
  recipes: { up_next_id: string; recipe_title: string }[];
}

const USUAL_KEY = ['usual'] as const;
const POLL_MS = 10_000;

// Optimistic rows get a temp id; once the server answers, the real id keeps the temp key
// so the row does not remount (and does not flash twice).
const keyByRealId = new Map<string, string>();
let tempCounter = 0;

function keyOf(id: string): string {
  return keyByRealId.get(id) ?? id;
}

type Row = GroceryItem & { grocery_item_recipes: { up_next_id: string; recipe_title: string }[] | null };

const COLUMNS =
  'id, household_id, label, product_id, quantity, unit, category, status, source, checked_at, bought_at, created_at, updated_at, grocery_item_recipes(up_next_id, recipe_title)';

async function fetchGroceries(): Promise<GroceryLine[]> {
  const rows = must(
    await supabase.from('grocery_items').select(COLUMNS).in('status', ['to_buy', 'in_cart']).order('created_at', { ascending: true }),
  ) as unknown as Row[];
  return rows.map(({ grocery_item_recipes, ...item }) => ({
    ...item,
    quantity: item.quantity === null ? null : Number(item.quantity),
    key: keyOf(item.id),
    recipes: grocery_item_recipes ?? [],
  }));
}

function sameLine(a: { product_id: string | null; label: string }, b: { product_id: string | null; label: string }): boolean {
  if (a.product_id) return a.product_id === b.product_id;
  return !b.product_id && a.label.trim().toLowerCase() === b.label.trim().toLowerCase();
}

/** Mirrors the SQL merge of add_grocery_item. */
function mergeQuantity(item: GroceryLine, quantity: number | null, unit: Unit | null): Pick<GroceryLine, 'quantity' | 'unit'> {
  if (quantity !== null && item.quantity !== null && (item.unit ?? '') === (unit ?? '')) {
    return { quantity: item.quantity + quantity, unit: item.unit };
  }
  if (item.quantity === null && quantity !== null) return { quantity, unit };
  return { quantity: item.quantity, unit: item.unit };
}

function invalidateWhenIdle(qc: QueryClient): void {
  if (qc.isMutating({ mutationKey: GROCERIES_KEY }) <= 1) {
    void qc.invalidateQueries({ queryKey: GROCERIES_KEY });
    void qc.invalidateQueries({ queryKey: USUAL_KEY });
  }
}

/** The pantry follows what is bought or already at home. */
function invalidatePantry(qc: QueryClient): void {
  refreshPantryViews(qc);
  void qc.invalidateQueries({ queryKey: PANTRY_UPDATED_KEY });
}

function setLines(qc: QueryClient, update: (lines: GroceryLine[]) => GroceryLine[]): void {
  qc.setQueryData<GroceryLine[]>(GROCERIES_KEY, (cur) => update(cur ?? []));
}

// Reads -------------------------------------------------------------------------

export interface AisleGroup {
  category: Category;
  items: GroceryLine[];
}

/**
 * The shared list. With `live`, refetches when the screen gains focus and every 10 s while focused.
 */
export function useGroceries({ live = false }: { live?: boolean } = {}) {
  const householdId = useHouseholdId();
  const qc = useQueryClient();
  const focused = useIsFocused();
  const query = useQuery({
    queryKey: GROCERIES_KEY,
    queryFn: fetchGroceries,
    enabled: !!householdId,
    refetchInterval: () => (live && focused && qc.isMutating({ mutationKey: GROCERIES_KEY }) === 0 ? POLL_MS : false),
  });

  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (live && householdId) void refetch();
    }, [live, householdId, refetch]),
  );

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
    return { lines, toBuy, inCart, aisles, byKey, listAisles, listCart };
  }, [query.data]);

  return { ...query, ...view };
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

/** "500 g", "2", "" for a line. */
export function lineQuantity(line: Pick<GroceryItem, 'quantity' | 'unit'>): string {
  return formatQuantity(line.quantity, line.unit);
}

export function lineTags(line: GroceryLine): string[] {
  return [...new Set(line.recipes.map((r) => r.recipe_title))];
}

export interface GroceryListRow {
  key: string;
  label: string;
  quantity: string;
  tags: string[];
}

function toListItem(line: GroceryLine): GroceryListRow {
  return { key: line.key, label: line.label, quantity: lineQuantity(line), tags: lineTags(line) };
}

// Add ----------------------------------------------------------------------------

export interface AddResult {
  /** Keys of the rows that were added or grew (for the flash). */
  keys: string[];
  /** "Added to Produce", "Added 3 items". */
  message: string;
  undo: () => void;
}

export function toAddInputs(items: ResolvedGroceryItem[]): AddInput[] {
  return items.map((i) => ({
    label: i.label,
    product_id: i.product?.id ?? null,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
  }));
}

function addedMessage(inputs: AddInput[]): string {
  const first = inputs[0];
  if (inputs.length === 1 && first) return `Added to ${CATEGORY_LABEL[first.category]}`;
  const categories = new Set(inputs.map((i) => i.category));
  const only = [...categories][0];
  return categories.size === 1 && only ? `Added ${inputs.length} items to ${CATEGORY_LABEL[only]}` : `Added ${inputs.length} items`;
}

/**
 * Adds items with `add_grocery_item` (which merges with an existing line). The list updates at once;
 * the returned `undo` takes the additions back.
 */
export function useAddGroceries() {
  const qc = useQueryClient();
  const undoMutation = useMutation<void, Error, UndoStep[]>({
    mutationKey: groceryMutationKeys.undo,
    onMutate: async (steps) => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      setLines(qc, (lines) =>
        lines
          .filter((l) => !steps.some((s) => s.kind === 'delete' && s.id === l.id))
          .map((l) => {
            const s = steps.find((x) => x.id === l.id);
            return s && s.kind === 'restore' ? { ...l, quantity: s.quantity, unit: s.unit } : l;
          }),
      );
    },
    onSettled: () => invalidateWhenIdle(qc),
  });

  const mutation = useMutation<{ rows: GroceryItem[]; undo: UndoStep[] }, Error, AddVars, { prev: GroceryLine[] | undefined }>({
    mutationKey: groceryMutationKeys.add,
    onMutate: async ({ inputs, source, tempIds }) => {
      await qc.cancelQueries({ queryKey: GROCERIES_KEY });
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY);
      setLines(qc, (lines) => {
        const next = [...lines];
        inputs.forEach((input, idx) => {
          const at = next.findIndex((l) => l.status === 'to_buy' && sameLine(input, l));
          const existing = at >= 0 ? next[at] : undefined;
          if (existing) {
            next[at] = { ...existing, ...mergeQuantity(existing, input.quantity, input.unit) };
            return;
          }
          // The list changed since add() predicted a merge: create the row and remember its temp id.
          const id = tempIds[idx] ?? `temp-${++tempCounter}`;
          tempIds[idx] = id;
          const now = new Date().toISOString();
          next.push({
            id,
            key: id,
            household_id: '',
            label: input.label,
            product_id: input.product_id,
            quantity: input.quantity,
            unit: input.unit,
            category: input.category,
            status: 'to_buy',
            source,
            checked_at: null,
            bought_at: null,
            created_at: now,
            updated_at: now,
            recipes: [],
          });
        });
        return next;
      });
      return { prev };
    },
    onSuccess: ({ rows }, { tempIds }) => {
      setLines(qc, (lines) => {
        let next = [...lines];
        rows.forEach((row, idx) => {
          const tempId = tempIds[idx] ?? null;
          // Queued checks / edits / deletes of the temp row resolve to the real id from now on.
          if (tempId) rememberRealId(tempId, row.id);
          const server: GroceryLine = { ...row, quantity: row.quantity === null ? null : Number(row.quantity), key: keyOf(row.id), recipes: [] };
          const existing = next.find((l) => l.id === row.id);
          const temp = tempId ? next.find((l) => l.id === tempId) : undefined;
          if (temp && !existing) {
            keyByRealId.set(row.id, temp.key);
            // Keep what changed locally while the add was in flight (checked, edited).
            const { status, checked_at, label, quantity, unit, category } = temp;
            next = next.map((l) => (l.id === temp.id ? { ...server, key: temp.key, status, checked_at, label, quantity, unit, category } : l));
          } else if (existing) {
            next = next
              .filter((l) => l.id !== tempId)
              .map((l) => (l.id === row.id ? { ...l, quantity: server.quantity, unit: server.unit, updated_at: server.updated_at } : l));
          } else if (!tempId) {
            // The server created a line we did not predict (the list changed meanwhile).
            next.push(server);
          }
          // Otherwise the temp row was removed locally meanwhile; its queued removal targets the real id.
        });
        return next;
      });
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GROCERIES_KEY, ctx.prev);
    },
    onSettled: () => invalidateWhenIdle(qc),
  });

  const add = useCallback(
    (inputs: AddInput[], source: GrocerySource = 'manual', onError?: (error: unknown) => void): AddResult => {
      const prev = qc.getQueryData<GroceryLine[]>(GROCERIES_KEY) ?? [];
      // Predict which inputs create a new row, so their temp keys can flash right away.
      const tempIds: (string | null)[] = [];
      const keys: string[] = [];
      const seen: AddInput[] = [];
      for (const input of inputs) {
        const existing = prev.find((l) => l.status === 'to_buy' && sameLine(input, l));
        const dup = seen.find((s) => sameLine(input, s));
        if (existing) {
          tempIds.push(null);
          keys.push(existing.key);
        } else if (dup) {
          tempIds.push(null);
        } else {
          const id = `temp-${++tempCounter}`;
          tempIds.push(id);
          keys.push(id);
        }
        seen.push(input);
      }
      // Only the lines these inputs merge into travel with the mutation (it may be saved to disk offline).
      const merged = prev
        .filter((l) => inputs.some((i) => sameLine(i, l)))
        .map(({ id, status, quantity, unit }) => ({ id, status, quantity, unit }));
      const promise = mutation.mutateAsync({ inputs, source, prev: merged, tempIds });
      promise.catch((e: unknown) => onError?.(e));
      return {
        keys,
        message: addedMessage(inputs),
        undo: () => {
          promise.then(({ undo }) => undoMutation.mutate(undo)).catch(() => undefined);
        },
      };
    },
    [qc, mutation, undoMutation],
  );

  return { add, isPending: mutation.isPending, error: mutation.error };
}

/** Adds what someone typed in a QuickAddField. */
export function useQuickAdd() {
  const { add, ...rest } = useAddGroceries();
  const addText = useCallback(
    (items: ResolvedGroceryItem[], onError?: (error: unknown) => void) => add(toAddInputs(items), 'manual', onError),
    [add],
  );
  return { addItems: addText, ...rest };
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
      invalidatePantry(qc);
    },
  });
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
      invalidatePantry(qc);
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
const STARTERS = ['Milk', 'Egg', 'Corn tortilla', 'Coffee'];

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
