// Changing the pantry by hand: stocking ("+", starter basics, "I have it"), corrections, "out", staples, and
// putting rows back as they were (Undo). How the screens say them: pantryActions.ts.
import type { Category, PantryLevel, Unit, Zone } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useHouseholdId } from './household';
import { PANTRY_KEY, STAPLES_KEY } from './keys';
import type { PantryEntry } from './pantry';
import { refresh } from './refresh';
import { rpc, type PantryAddInput } from './rpc';
import { must, supabase } from './supabase';

/** Puts things in the pantry. Resolves with how many were added. */
export function useAddToPantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: PantryAddInput[]) => rpc('add_to_pantry', { p_items: items }),
    onSettled: () => refresh(qc, 'pantry'),
  });
}

export interface PantryItemChange {
  id: string;
  level?: Exclude<PantryLevel, 'out'>;
  zone?: Zone;
  /** "YYYY-MM-DD"; null clears the date. */
  expiresOn?: string | null;
}

type PantryCache = { prev: PantryEntry[] | undefined };

/** Patches the cached pantry at once (the screen moves on tap); the server answer then refreshes it. */
async function patchPantry(qc: QueryClient, patch: (rows: PantryEntry[]) => PantryEntry[]): Promise<PantryCache> {
  await qc.cancelQueries({ queryKey: PANTRY_KEY });
  const prev = qc.getQueryData<PantryEntry[]>(PANTRY_KEY);
  if (prev) qc.setQueryData<PantryEntry[]>(PANTRY_KEY, patch(prev));
  return { prev };
}

function rollback(qc: QueryClient, ctx: PantryCache | undefined): void {
  if (ctx?.prev) qc.setQueryData(PANTRY_KEY, ctx.prev);
}

/** A product's rows in the pantry as the phone has them (what Undo puts back). */
export function pantryRowsOf(qc: QueryClient, productId: string): PantryEntry[] {
  return (qc.getQueryData<PantryEntry[]>(PANTRY_KEY) ?? []).filter((r) => r.product_id === productId);
}

/** Level, zone or date of one pantry row. Its failure says so itself (meta). */
export function useSetPantryItem() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, PantryItemChange, PantryCache>({
    meta: { errorMessage: "Couldn't save that. It's back as it was." },
    onMutate: ({ id, level, zone, expiresOn }) =>
      patchPantry(qc, (rows) =>
        rows.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                level: level ?? r.level,
                zone: zone ?? r.zone,
                expires_on: expiresOn === undefined ? r.expires_on : expiresOn,
              },
        ),
      ),
    onError: (_e, _v, ctx) => rollback(qc, ctx),
    mutationFn: ({ id, level, zone, expiresOn }: PantryItemChange) =>
      rpc('set_pantry_item', {
        p_item: id,
        p_level: level ?? null,
        p_zone: zone ?? null,
        p_expires_on: expiresOn ?? null,
        p_clear_expiry: expiresOn === null,
      }),
    onSettled: () => refresh(qc, 'pantry'),
  });
}

/** The exact amount of one pantry row ("2 pcs", "500 g"); null quantity clears it. Zero is "out" (usePantryOut). */
export function useSetPantryQuantity() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; quantity: number | null; unit: Unit | null }, PantryCache>({
    meta: { errorMessage: "Couldn't save the amount. It's back as it was." },
    onMutate: ({ id, quantity, unit }) =>
      patchPantry(qc, (rows) =>
        rows.map((r) => (r.id !== id ? r : { ...r, quantity, unit: quantity === null ? null : unit, level: quantity === null ? r.level : 'full' })),
      ),
    onError: (_e, _v, ctx) => rollback(qc, ctx),
    mutationFn: ({ id, quantity, unit }) => rpc('set_pantry_quantity', { p_item: id, p_quantity: quantity, p_unit: quantity === null ? null : unit }),
    onSettled: () => refresh(qc, 'pantry'),
  });
}

/** Used up (also a staple). With `addToList`, it goes back on the grocery list; resolves with that line's id. */
export function usePantryOut() {
  const qc = useQueryClient();
  return useMutation<string | null, Error, { productId: string; addToList: boolean }, PantryCache>({
    onMutate: ({ productId }) => patchPantry(qc, (rows) => rows.filter((r) => r.product_id !== productId)),
    onError: (_e, _v, ctx) => rollback(qc, ctx),
    mutationFn: ({ productId, addToList }: { productId: string; addToList: boolean }) =>
      rpc('pantry_out', { p_product: productId, p_add_to_list: addToList }),
    onSettled: (_d, _e, { addToList }) => refresh(qc, addToList ? 'groceries.stocked' : 'pantry'),
  });
}

/** One row back as it was: its amount (the 0 of "out" cleared), its level, its date. */
async function restoreRow(r: PantryEntry): Promise<void> {
  await rpc('set_pantry_quantity', { p_item: r.id, p_quantity: r.quantity, p_unit: r.quantity === null ? null : r.unit });
  await rpc('set_pantry_item', {
    p_item: r.id,
    // An amount already made it full; without one, the level it had.
    p_level: r.quantity !== null ? null : r.level && r.level !== 'out' ? r.level : 'full',
    p_zone: null,
    p_expires_on: r.expires_on,
    p_clear_expiry: r.expires_on === null,
  });
}

export interface PantryRestore {
  productId: string;
  /** Its rows before the change (pantryRowsOf). */
  rows: PantryEntry[];
  /**
   * What "not at home" was: 'none' (no row: a staple counted at home; the out rows go) or 'out' (it goes
   * out again, e.g. after "Already have").
   */
  without: 'none' | 'out';
}

/** Undo for the pantry: a product's rows as they were before "out", "It's gone" or "Already have". */
export function useRestorePantry() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't put it back. Try again." },
    mutationFn: async ({ productId, rows, without }: PantryRestore) => {
      if (rows.length > 0) {
        for (const r of rows) await restoreRow(r);
      } else if (without === 'out') {
        await rpc('pantry_out', { p_product: productId, p_add_to_list: false });
      } else {
        must(await supabase.from('pantry_items').delete().eq('product_id', productId).eq('level', 'out'));
      }
    },
    onMutate: async ({ productId, rows }) => {
      // Back on screen at once.
      await patchPantry(qc, (list) => [...list.filter((r) => r.product_id !== productId), ...rows]);
    },
    onSettled: () => refresh(qc, 'pantry'),
  });
}

export interface StapleView {
  productId: string;
  name: string;
  category: Category;
  isOut: boolean;
}

/** Salt, oil, spices…: counted as at home until marked out. */
export function useStaples() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: STAPLES_KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<StapleView[]> =>
      (await rpc('always_have_list', {})).map((s) => ({ productId: s.product_id, name: s.name, category: s.category, isOut: s.is_out })),
  });
}

/** "We don't keep it" (false) or "we always have it" (true). Its failure says so itself (meta). */
export function useSetAlwaysHave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: { productId: string; value: boolean }[]) =>
      Promise.all(changes.map((c) => rpc('set_always_have', { p_product: c.productId, p_value: c.value }))),
    meta: { errorMessage: "Couldn't save your basics. Try again." },
    onSettled: () => refresh(qc, 'pantry'),
  });
}

/** "Staples list" line: "Salt, oil, cumin +9". */
export function staplesLine(staples: StapleView[]): string {
  const names = staples.map((s) => s.name.toLowerCase());
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}
