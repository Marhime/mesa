// Adding to the grocery list: typed items and usual picks. Optimistic, with Undo.
import { CATEGORY_LABEL, type GroceryItem, type GrocerySource } from '@mesa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { ResolvedGroceryItem } from '../lib/groceryInput';
import { invalidateWhenIdle, keyByRealId, keyOf, mergeQuantity, nextTempId, sameLine, setLines, type GroceryLine } from './groceryCache';
import { groceryMutationKeys, rememberRealId, resolveId, type AddInput, type AddVars, type UndoStep } from './groceryMutations';
import { GROCERIES_KEY } from './keys';

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
  if (inputs.length === 1 && first) return `Added ${first.label.toLowerCase()} to ${CATEGORY_LABEL[first.category]}`;
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
  const { mutate: mutateUndo } = useMutation<void, Error, UndoStep[]>({
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
          const id = tempIds[idx] ?? nextTempId();
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
  const { mutateAsync: mutateAdd } = mutation;

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
          const id = nextTempId();
          tempIds.push(id);
          keys.push(id);
        }
        seen.push(input);
      }
      // Only the lines these inputs merge into travel with the mutation (it may be saved to disk offline).
      const merged = prev
        .filter((l) => inputs.some((i) => sameLine(i, l)))
        .map(({ id, status, quantity, unit }) => ({ id, status, quantity, unit }));
      const promise = mutateAdd({ inputs, source, prev: merged, tempIds });
      promise.catch((e: unknown) => onError?.(e));
      return {
        keys,
        message: addedMessage(inputs),
        undo: () => {
          // At once on the phone, even offline: the rows it created go, the lines it grew shrink back.
          const created = new Set(tempIds.flatMap((id) => (id ? [id, resolveId(id)] : [])));
          setLines(qc, (lines) =>
            lines
              .filter((l) => !created.has(l.id))
              .map((l) => {
                const before = merged.find((m) => m.id === l.id && m.status === 'to_buy');
                return before ? { ...l, quantity: before.quantity, unit: before.unit } : l;
              }),
          );
          // On the server once the add got there (its rows have real ids by then).
          promise.then(({ undo }) => mutateUndo(undo)).catch(() => undefined);
        },
      };
    },
    [qc, mutateAdd, mutateUndo],
  );

  return { add, isPending: mutation.isPending, error: mutation.error };
}

