// What a household has, as the worker reads it with the service role (every query scoped to the household
// by hand): its pantry rows (the pantry_status view: the SQL rules for "at home") and its shopping list.
// One reader each; every job asks them for what it needs.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, GroceryStatus, PantryLevel, Unit, Zone } from '@mesa/shared';

/** PostgREST answers 1000 rows at most. */
const MAX_PANTRY_ROWS = 1000;
const MAX_LIST_LINES = 200;

/** A pantry_status row. */
export interface PantryStatusRow {
  product_id: string;
  name_en: string;
  category: Category;
  zone: Zone;
  /** ok | soon | check | gone | out */
  state: string;
  expires_on: string | null;
  quantity: number | null;
  unit: Unit | null;
  level: PantryLevel | null;
}

export interface PantryQuery {
  /** States left out ('out', 'gone'). */
  without?: readonly string[];
  zone?: Zone;
  /** Only rows with a date, soonest first. */
  dated?: boolean;
  limit?: number;
}

const PANTRY_COLUMNS = 'product_id, name_en, category, zone, state, expires_on, quantity, unit, level';

export async function pantryRows(db: SupabaseClient, householdId: string, q: PantryQuery = {}): Promise<PantryStatusRow[]> {
  let query = db.from('pantry_status').select(PANTRY_COLUMNS).eq('household_id', householdId);
  if (q.zone) query = query.eq('zone', q.zone);
  if (q.without?.length) query = query.not('state', 'in', `(${q.without.map((s) => `"${s}"`).join(',')})`);
  if (q.dated) query = query.not('expires_on', 'is', null).order('expires_on', { ascending: true });
  const { data, error } = await query.limit(q.limit ?? MAX_PANTRY_ROWS);
  if (error) throw new Error(`pantry_status: ${error.message}`);
  return (data ?? []) as PantryStatusRow[];
}

/** A grocery_items line. */
export interface ListLine {
  id: string;
  label: string;
  product_id: string | null;
  category: Category;
  quantity: number | null;
  unit: Unit | null;
}

/** The list's lines in these states, oldest first. */
export async function listLines(db: SupabaseClient, householdId: string, statuses: readonly GroceryStatus[]): Promise<ListLine[]> {
  const { data, error } = await db
    .from('grocery_items')
    .select('id, label, product_id, category, quantity, unit')
    .eq('household_id', householdId)
    .in('status', [...statuses])
    .order('created_at')
    .limit(MAX_LIST_LINES);
  if (error) throw new Error(`grocery_items: ${error.message}`);
  return (data ?? []) as ListLine[];
}
