// Reading the pantry (the pantry_status view: each row with its state) and how it is shown.
import {
  capitalize,
  familyOf,
  formatQuantity,
  pictoOf,
  type Category,
  type Family,
  type PantryItem,
  type PantryLevel,
  type Picto,
  type Unit,
  type UnitFamily,
} from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { dayLabel, daysUntil, recentDayName, untilLabel } from '../lib/days';
import { plural } from '../lib/text';
import { useHouseholdId } from './household';
import { PANTRY_KEY, PANTRY_UPDATED_KEY } from './keys';
import { must, supabase } from './supabase';

/** ok · soon (use within 3 days) · check (past its date, may still be fine) · gone (past its date for 3+ days). */
export type PantryState = 'ok' | 'soon' | 'check' | 'gone';

/** The Use soon rail looks a week ahead. */
const RAIL_DAYS = 7;
const RAIL_MAX = 8;

/** Something in the pantry, with its product's name, category, family (section) and picto. */
export interface PantryEntry extends Omit<PantryItem, 'household_id'> {
  name: string;
  category: Category;
  family: Family;
  picto: Picto;
  /** How the product is counted (pcs, g, ml): the unit the amount field starts with. */
  unitFamily: UnitFamily;
  shelfLifeDays: number | null;
  state: PantryState;
}

type Row = Omit<PantryItem, 'household_id'> & {
  name_en: string;
  category: Category;
  shelf_life_days: number | null;
  unit_family: UnitFamily;
  family: string | null;
  picto: string | null;
  state: PantryState | 'out';
};

async function fetchPantry(): Promise<PantryEntry[]> {
  const rows = must(
    await supabase
      .from('pantry_status')
      .select('id, product_id, zone, quantity, unit, level, expires_on, updated_at, name_en, category, shelf_life_days, unit_family, family, picto, state')
      .neq('state', 'out')
      .order('expires_on', { ascending: true, nullsFirst: false }),
  ) as Row[];
  return rows.map(({ name_en, shelf_life_days, unit_family, family, picto, state, ...item }) => ({
    ...item,
    quantity: item.quantity === null ? null : Number(item.quantity),
    name: capitalize(name_en),
    family: familyOf({ family, category: item.category }),
    picto: pictoOf({ picto, category: item.category }),
    unitFamily: unit_family,
    shelfLifeDays: shelf_life_days,
    state: state as PantryState,
  }));
}

/** A card of the Use soon rail. */
export interface UseSoonView {
  key: string;
  productId: string;
  name: string;
  picto: Picto;
  when: string;
  urgent: boolean;
  freshness: number;
}

function useSoonView(e: PantryEntry, today: Date): UseSoonView {
  const days = daysUntil(e.expires_on!, today);
  const life = e.shelfLifeDays ?? RAIL_DAYS;
  return {
    key: e.id,
    productId: e.product_id,
    name: e.name,
    picto: e.picto,
    when: untilLabel(days),
    urgent: days <= 0,
    freshness: Math.max(0.05, Math.min(1, days / life)),
  };
}

/**
 * The pantry. Derived: what is at home, what to use within the week (the rail), and what is past its
 * date and needs a look ("Still there?"). Sections by type of food: pantrySections.ts.
 */
export function usePantry() {
  const householdId = useHouseholdId();
  const query = useQuery({ queryKey: PANTRY_KEY, enabled: !!householdId, queryFn: fetchPantry });
  const view = useMemo(() => {
    const all = query.data ?? [];
    const today = new Date();
    const items = all.filter((e) => e.state !== 'gone');
    const stale = all.filter((e) => e.state === 'check' || e.state === 'gone');
    const useSoon = items
      .filter((e) => e.expires_on !== null && e.state !== 'check' && daysUntil(e.expires_on, today) <= RAIL_DAYS)
      .slice(0, RAIL_MAX)
      .map((e) => useSoonView(e, today));
    const atHome = items.filter((e) => e.state !== 'check');
    return { all, items, stale, useSoon, atHome };
  }, [query.data]);
  const { data, isLoading, isError, refetch } = query;
  return { data, isLoading, isError, refetch, ...view };
}

/** "updated after Saturday's shopping", from the last purchase. Null before the first one. */
export function usePantryUpdated(): string | null {
  const householdId = useHouseholdId();
  const { data } = useQuery({
    queryKey: PANTRY_UPDATED_KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<string | null> => {
      const rows = must(
        await supabase.from('pantry_events').select('created_at').eq('reason', 'purchase').order('created_at', { ascending: false }).limit(1),
      ) as { created_at: string }[];
      return rows[0]?.created_at ?? null;
    },
  });
  if (!data) return null;
  const day = recentDayName(data);
  return day.recent ? `updated after ${day.name}'s shopping` : `updated ${day.name}`;
}

/** "38 items · updated after Saturday's shopping". */
export function pantrySummary(count: number, updated: string | null): string {
  return [plural(count, 'item', 'items'), updated].filter(Boolean).join(' · ');
}

const LEVEL_TEXT: Record<Exclude<PantryLevel, 'out'>, string> = { full: 'Plenty', half: 'About half', low: 'Running low' };

/** How much is left: the amount when counted ("6", "500 g"), else a plain word. Low turns red. */
export function pantryAmount(e: Pick<PantryEntry, 'quantity' | 'unit' | 'level'>): { text: string; low: boolean } {
  if (e.quantity !== null && e.quantity > 0) return { text: formatQuantity(e.quantity, e.unit) || 'Plenty', low: e.level === 'low' };
  const level = e.level === null || e.level === 'out' ? 'full' : e.level;
  return { text: LEVEL_TEXT[level], low: level === 'low' };
}

const COUNTED_IN: Record<UnitFamily, Unit | null> = { count: 'unit', mass: 'g', volume: 'ml', other: null };

/** The amount as the edit field starts: the stored one, or an empty field already in pcs / g / ml. */
export function pantryEditAmount(e: Pick<PantryEntry, 'quantity' | 'unit' | 'unitFamily'>): { quantity: number | null; unit: Unit | null } {
  return { quantity: e.quantity, unit: e.unit ?? COUNTED_IN[e.unitFamily] };
}

/** "Keeps until Nov 12", "Expired Sun · still there?", "No date". */
export function pantryDateLine(e: Pick<PantryEntry, 'expires_on' | 'state'>): string {
  if (!e.expires_on) return 'No date';
  if (e.state === 'check' || e.state === 'gone') return `Past its date (${dayLabel(e.expires_on)}) · still there?`;
  return `Keeps until ${dayLabel(e.expires_on)}`;
}

export const PANTRY_LEVELS: { value: PantryLevel; label: string }[] = [
  { value: 'full', label: 'Plenty' },
  { value: 'half', label: 'Half' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out' },
];
