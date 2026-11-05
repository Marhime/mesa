// Changing the pantry by hand: stocking ("+", starter basics, "I have it"), corrections, "out", staples.
import type { Category, PantryLevel, Zone } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isoInDays } from '../lib/days';
import { friendlyError } from './errors';
import { GROCERIES_KEY } from './groceries';
import { useHouseholdId } from './household';
import { STAPLES_KEY, refreshPantryViews } from './keys';
import type { PantryEntry } from './pantry';
import { rpc, type PantryAddInput } from './rpc';

/** Puts things in the pantry. Resolves with how many were added. */
export function useAddToPantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: PantryAddInput[]) => rpc('add_to_pantry', { p_items: items }),
    onSettled: () => refreshPantryViews(qc),
  });
}

export interface PantryItemChange {
  id: string;
  level?: Exclude<PantryLevel, 'out'>;
  zone?: Zone;
  /** "YYYY-MM-DD"; null clears the date. */
  expiresOn?: string | null;
}

/** Level, zone or date of one pantry row. */
export function useSetPantryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, level, zone, expiresOn }: PantryItemChange) =>
      rpc('set_pantry_item', {
        p_item: id,
        p_level: level ?? null,
        p_zone: zone ?? null,
        p_expires_on: expiresOn ?? null,
        p_clear_expiry: expiresOn === null,
      }),
    onSettled: () => refreshPantryViews(qc),
  });
}

/** Used up (also a staple). With `addToList`, it goes back on the grocery list; resolves with that line's id. */
export function usePantryOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, addToList }: { productId: string; addToList: boolean }) =>
      rpc('pantry_out', { p_product: productId, p_add_to_list: addToList }),
    onSettled: (_d, _e, { addToList }) => {
      refreshPantryViews(qc);
      if (addToList) void qc.invalidateQueries({ queryKey: GROCERIES_KEY });
    },
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

/** "We don't keep it" (false) or "we always have it" (true). */
export function useSetAlwaysHave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: { productId: string; value: boolean }[]) =>
      Promise.all(changes.map((c) => rpc('set_always_have', { p_product: c.productId, p_value: c.value }))),
    onSettled: () => refreshPantryViews(qc),
  });
}

/** "Staples list" line: "Salt, oil, cumin +9". */
export function staplesLine(staples: StapleView[]): string {
  const names = staples.map((s) => s.name.toLowerCase());
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

/**
 * Pantry corrections as the screens say them. `notify` shows the outcome (a toast) with an optional action.
 */
export function usePantryActions(notify: (message: string, action?: { label: string; onPress: () => void }) => void) {
  const setItem = useSetPantryItem();
  const out = usePantryOut();
  const add = useAddToPantry();
  const fail = (e: unknown) => notify(friendlyError(e, "Couldn't save that. Try again."));

  return {
    setLevel: (e: PantryEntry, level: PantryLevel) => {
      if (level === 'out') {
        out.mutate({ productId: e.product_id, addToList: true }, { onSuccess: () => notify(`${e.name} is out · on your list`), onError: fail });
      } else {
        setItem.mutate({ id: e.id, level }, { onError: fail });
      }
    },
    setZone: (e: PantryEntry, zone: Zone) => setItem.mutate({ id: e.id, zone }, { onError: fail }),
    setKeeps: (e: PantryEntry, days: number | null) =>
      setItem.mutate({ id: e.id, expiresOn: days === null ? null : isoInDays(days) }, { onError: fail }),
    /** Past its date but fine: three more days. */
    stillGood: (e: PantryEntry) => setItem.mutate({ id: e.id, expiresOn: isoInDays(3) }, { onError: fail }),
    /** Past its date and gone: out of the pantry, and the list if wanted. */
    gone: (e: PantryEntry) =>
      out.mutate(
        { productId: e.product_id, addToList: false },
        {
          onSuccess: () =>
            notify(`Took ${e.name.toLowerCase()} out of the pantry`, {
              label: 'Add to list',
              onPress: () => out.mutate({ productId: e.product_id, addToList: true }, { onError: fail }),
            }),
          onError: fail,
        },
      ),
    addToList: (e: PantryEntry) =>
      out.mutate({ productId: e.product_id, addToList: true }, { onSuccess: () => notify(`${e.name} is on your list`), onError: fail }),
    /** "I have it" (a recipe's To buy, a search miss): in the pantry without a date; Undo takes it back out. */
    have: (productId: string, name: string) =>
      add.mutate([{ product_id: productId }], {
        onSuccess: () =>
          notify(`${name} added to pantry`, {
            label: 'Undo',
            onPress: () => out.mutate({ productId, addToList: false }, { onError: fail }),
          }),
        onError: fail,
      }),
    staple: {
      out: (productId: string, name: string) =>
        out.mutate({ productId, addToList: true }, { onSuccess: () => notify(`${name} is on your list`), onError: fail }),
      back: (productId: string) => add.mutate([{ product_id: productId }], { onError: fail }),
    },
  };
}
