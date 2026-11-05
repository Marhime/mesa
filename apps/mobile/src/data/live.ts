// Live sync between the household's phones: Supabase Realtime tells this phone when the other one
// changed something, and the matching queries refetch. The cache keeps the app instant and offline;
// this keeps it current. Polling (Groceries) and refetch on foreground stay as a fallback.
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useHouseholdId } from './household';
import { COVERAGE_KEY, GROCERIES_KEY, PANTRY_UPDATED_KEY, refreshPantryViews } from './keys';
import { recipeKeys } from './recipes';
import { supabase } from './supabase';
import { UP_NEXT_KEY } from './upNext';
import { IMPORTS_KEY } from './imports';
import { SCANS_KEY } from './scans';

const DEBOUNCE_MS = 300;

type Refresh = (qc: ReturnType<typeof useQueryClient>) => void;
const keys = (...list: QueryKey[]): Refresh => (qc) => list.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));

/** What to refresh when a household table changes. */
const ON_CHANGE: Record<string, Refresh> = {
  grocery_items: (qc) => {
    // A change of our own still on its way: its own refresh follows; refetching now would flicker.
    if (qc.isMutating({ mutationKey: GROCERIES_KEY }) > 0) return;
    keys(GROCERIES_KEY, ['usual'])(qc);
  },
  recipes: keys(recipeKeys.list, ['recipe'], COVERAGE_KEY),
  up_next: keys(UP_NEXT_KEY),
  pantry_items: (qc) => {
    refreshPantryViews(qc);
    void qc.invalidateQueries({ queryKey: PANTRY_UPDATED_KEY });
  },
  household_staples: refreshPantryViews,
  import_jobs: keys(IMPORTS_KEY, recipeKeys.list, SCANS_KEY),
  pantry_proposals: keys(SCANS_KEY),
};

/** Subscribes while the app is signed in with a household. */
export function useHouseholdLiveSync(enabled: boolean): void {
  const householdId = useHouseholdId();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !householdId) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const schedule = (table: string) => {
      clearTimeout(timers.get(table));
      timers.set(table, setTimeout(() => ON_CHANGE[table]?.(qc), DEBOUNCE_MS));
    };
    let channel = supabase.channel(`household:${householdId}`);
    for (const table of Object.keys(ON_CHANGE)) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => schedule(table),
      );
    }
    channel.subscribe();
    return () => {
      timers.forEach(clearTimeout);
      void supabase.removeChannel(channel);
    };
  }, [enabled, householdId, qc]);
}
