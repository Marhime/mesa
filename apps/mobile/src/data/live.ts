// Live sync between the household's phones: Supabase Realtime tells this phone when the other one (or the
// worker) changed something, each change becomes a refresh event (refresh.ts) and what is on screen reads
// again. The cache keeps the app instant and offline; this keeps it current. While the channel is up the
// quick job polls stop (liveStatus.ts); when it drops they come back, and coming back reads again what may
// have been missed. Polling (Groceries) and refetch on foreground stay as a fallback.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { applyAskDraft } from './askDraft';
import { isAskKind } from './askKinds';
import { useHouseholdId } from './household';
import { GROCERIES_KEY } from './keys';
import { setLiveConnected } from './liveStatus';
import { refreshAll, type RefreshCall } from './refresh';
import { supabase } from './supabase';

const DEBOUNCE_MS = 300;

interface Change {
  type: string;
  /** The row as it is now; for a delete, what is known of it (its id). */
  row: Record<string, unknown>;
}

const idOf = (row: Record<string, unknown>) => (typeof row.id === 'string' ? row.id : null);

/** A job, by what it is: a recipe import, a scan, something asked (that one only), or one we can't tell (a delete). */
function jobChange({ row }: Change): RefreshCall[] {
  const id = idOf(row);
  if (row.kind === 'recipe') return [['imports']];
  if (row.kind === 'sweep' || row.kind === 'receipt') return [['scans']];
  if (isAskKind(row.kind) && id) return [['askJob', { jobId: id }]];
  if (row.kind === undefined) return [['jobs']];
  // Work Mesa does on its own (tidy, follow_check, for_you): the tables it writes say what changed.
  return [];
}

/** What to refresh when a household table changes. */
const ON_CHANGE: Record<string, (change: Change) => RefreshCall[]> = {
  grocery_items: () => [['groceries']],
  // An edit, or its lines (a trigger bumps updated_at when they change): that recipe and what depends on it.
  recipes: ({ type, row }) => {
    const id = idOf(row);
    return type === 'UPDATE' && id ? [['recipe', { recipeId: id }]] : [['recipes']];
  },
  up_next: () => [['upNext']],
  pantry_items: () => [['pantry']],
  household_staples: () => [['pantry']],
  import_jobs: jobChange,
  pantry_proposals: () => [['scans']],
  followed_creators: () => [['creators']],
  creator_videos: () => [['creatorNews']],
  suggestions: () => [['forYou']],
};

/** Back after a drop: everything live sync covers may have changed meanwhile. */
const CATCH_UP: RefreshCall[] = [['groceries'], ['recipes.any'], ['upNext'], ['pantry'], ['jobs'], ['creators'], ['creatorNews'], ['forYou']];

/** Rows that apply themselves without a refetch (true: handled, nothing else to refresh). */
const ON_ROW: Partial<Record<string, (qc: QueryClient, row: Record<string, unknown>) => boolean>> = {
  // Ask Mesa writing its answer: several changes a second, the words only.
  import_jobs: applyAskDraft,
};

function flush(qc: QueryClient, calls: RefreshCall[]): void {
  // A change of our own still on its way: its own refresh follows; refetching now would flicker.
  const ownGroceries = qc.isMutating({ mutationKey: GROCERIES_KEY }) > 0;
  refreshAll(qc, ownGroceries ? calls.filter(([event]) => event !== 'groceries') : calls);
}

/** Subscribes while the app is signed in with a household. */
export function useHouseholdLiveSync(enabled: boolean): void {
  const householdId = useHouseholdId();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !householdId) return;
    let pending: RefreshCall[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (calls: RefreshCall[]) => {
      if (calls.length === 0) return;
      pending.push(...calls);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const due = pending;
        pending = [];
        flush(qc, due);
      }, DEBOUNCE_MS);
    };
    let channel = supabase.channel(`household:${householdId}`);
    for (const [table, onChange] of Object.entries(ON_CHANGE)) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        (payload) => {
          const p = payload as { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> };
          const row = p.new && Object.keys(p.new).length > 0 ? p.new : (p.old ?? {});
          if (ON_ROW[table]?.(qc, row)) return;
          schedule(onChange({ type: p.eventType ?? '', row }));
        },
      );
    }
    let dropped = false;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setLiveConnected(true);
        // The polls stood in until now; after a drop, anything may have been missed.
        schedule(dropped ? CATCH_UP : [['jobs']]);
        dropped = false;
      } else {
        setLiveConnected(false);
        dropped = true;
      }
    });
    return () => {
      clearTimeout(timer);
      setLiveConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [enabled, householdId, qc]);
}
