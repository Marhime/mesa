// Grocery writes that survive the app being closed offline. Each kind has its own key and server call,
// registered as mutation defaults: a paused mutation restored from disk after a restart can still run.
// The hooks in groceries.ts add the optimistic list updates on top.
import type { Category, GroceryItem, GrocerySource, GroceryStatus, Unit } from '@mesa/shared';
import type { QueryClient } from '@tanstack/react-query';

import { GROCERIES_KEY, refreshPantryViews } from './keys';
import { GROCERY_SCOPE } from './queryClient';
import { rpc, type PutAwayChoice } from './rpc';
import { must, supabase } from './supabase';

export const groceryMutationKeys = {
  add: [...GROCERIES_KEY, 'add'],
  undo: [...GROCERIES_KEY, 'undo'],
  toggle: [...GROCERIES_KEY, 'toggle'],
  have: [...GROCERIES_KEY, 'have'],
  remove: [...GROCERIES_KEY, 'remove'],
  update: [...GROCERIES_KEY, 'update'],
  complete: [...GROCERIES_KEY, 'complete'],
} as const;

// Optimistic rows get a temp id; once the add reaches the server, queued checks / edits / deletes of the
// temp row resolve to the real id. Kept in memory: a queue restored after a restart replays the add first.
const realIdByTemp = new Map<string, string>();

export function rememberRealId(tempId: string, realId: string): void {
  realIdByTemp.set(tempId, realId);
}

/** The server id of a line (optimistic lines keep their temp id until the server answers). */
export function resolveId(id: string): string {
  return realIdByTemp.get(id) ?? id;
}

export function isTempId(id: string): boolean {
  return id.startsWith('temp-');
}

/** A line whose add never reached the server has nothing to change there. */
function serverId(id: string): string | null {
  const real = resolveId(id);
  return isTempId(real) ? null : real;
}

export interface AddInput {
  label: string;
  product_id: string | null;
  quantity: number | null;
  unit: Unit | null;
  category: Category;
}

export type UndoStep = { id: string; kind: 'delete' } | { id: string; kind: 'restore'; quantity: number | null; unit: Unit | null };

export interface AddVars {
  inputs: AddInput[];
  source: GrocerySource;
  /** The lines these inputs merge into, as they were (to undo the merge). */
  prev: { id: string; status: GroceryStatus; quantity: number | null; unit: Unit | null }[];
  tempIds: (string | null)[];
}

export interface ItemEditVars {
  id: string;
  productId: string | null;
  label: string;
  quantity: number | null;
  unit: Unit | null;
  category: Category;
}

async function add({ inputs, source, prev, tempIds }: AddVars): Promise<{ rows: GroceryItem[]; undo: UndoStep[] }> {
  const rows: GroceryItem[] = [];
  for (const [idx, i] of inputs.entries()) {
    const row = await rpc('add_grocery_item', {
      p_label: i.label,
      p_product_id: i.product_id,
      p_quantity: i.quantity,
      p_unit: i.unit,
      p_category: i.category,
      p_source: source,
    });
    const tempId = tempIds[idx];
    if (tempId) rememberRealId(tempId, row.id);
    rows.push(row);
  }
  const undo: UndoStep[] = rows.map((row) => {
    const before = prev.find((l) => l.id === row.id && l.status === 'to_buy');
    return before ? { id: row.id, kind: 'restore', quantity: before.quantity, unit: before.unit } : { id: row.id, kind: 'delete' };
  });
  return { rows, undo };
}

async function undo(steps: UndoStep[]): Promise<void> {
  for (const s of steps) {
    if (s.kind === 'delete') must(await supabase.from('grocery_items').delete().eq('id', s.id));
    else must(await supabase.from('grocery_items').update({ quantity: s.quantity, unit: s.unit }).eq('id', s.id));
  }
}

async function toggle({ id, checked }: { id: string; checked: boolean }): Promise<void> {
  const target = serverId(id);
  if (!target) return;
  const patch = checked ? { status: 'in_cart' as const, checked_at: new Date().toISOString() } : { status: 'to_buy' as const, checked_at: null };
  must(await supabase.from('grocery_items').update(patch).eq('id', target));
}

async function have(id: string): Promise<void> {
  const target = serverId(id);
  if (target) await rpc('mark_have', { p_item_id: target });
}

async function remove({ id, restore }: { id: string; restore?: { status: GroceryStatus } }): Promise<void> {
  const target = serverId(id);
  if (!target) return;
  must(await supabase.from('grocery_items').update({ status: restore ? restore.status : 'removed' }).eq('id', target));
}

async function update({ id, productId, label, quantity, unit, category }: ItemEditVars): Promise<void> {
  const target = serverId(id);
  if (!target) return;
  must(await supabase.from('grocery_items').update({ label, quantity, unit, category, product_id: productId }).eq('id', target));
}

function complete(putAway: PutAwayChoice[]): Promise<number> {
  return rpc('complete_shopping', { p_put_away: putAway });
}

/** Call once, before the persisted cache is restored. */
export function registerGroceryMutations(qc: QueryClient): void {
  const refreshList = () => void qc.invalidateQueries({ queryKey: GROCERIES_KEY });
  const refreshAll = () => {
    refreshList();
    refreshPantryViews(qc);
  };
  const register = <V, R>(key: readonly string[], fn: (vars: V) => Promise<R>, onSettled: () => void) =>
    qc.setMutationDefaults([...key], { mutationFn: fn as (vars: unknown) => Promise<unknown>, scope: GROCERY_SCOPE, onSettled });
  register(groceryMutationKeys.add, add, refreshList);
  register(groceryMutationKeys.undo, undo, refreshList);
  register(groceryMutationKeys.toggle, toggle, refreshList);
  register(groceryMutationKeys.have, have, refreshAll);
  register(groceryMutationKeys.remove, remove, refreshList);
  register(groceryMutationKeys.update, update, refreshList);
  register(groceryMutationKeys.complete, complete, refreshAll);
}
