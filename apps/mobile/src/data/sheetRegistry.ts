// The app's sheets for work Mesa does on its own (a creator's videos, ideas for a food, a week plan), one
// entry each: the hook behind it. They share one contract (HostedSheet), so the host (askSheets.tsx) opens,
// hands off and recognises them by name; askKinds.ts names the sheet each kind of job opens in.
import { useCreatorSheet } from './creatorSheet';
import type { Notify } from './notice';
import { useUseItUp, type UseItUpFood } from './useItUp';
import { useWeekPlan } from './weekPlan';

export type SheetName = 'creator' | 'ideas' | 'weekPlan';

/** What every hosted sheet offers the host. `I`: what it opens on. */
export interface HostedSheet<I> {
  /** The job on show (null until queued). */
  jobId: string | null;
  open: (input: I) => void;
  /** Shows a job asked earlier (the Mesa button, a toast, a push). */
  openJob: (jobId: string) => void;
  /** Its component's props; the host only needs these two. */
  sheet: { visible: boolean; onClose: () => void };
}

/** What the sheets get from the host. */
export interface SheetDeps {
  /** A toast: "Importing 3 recipes from Food is Love", "4 dinners on the menu · list updated" · Undo. */
  notify: Notify;
  /** "Your recipes with tomato": Recipes filtered by that food. */
  onFoodRecipes: (food: UseItUpFood) => void;
}

const SHEETS = {
  creator: { useSheet: (deps: SheetDeps) => useCreatorSheet({ notify: deps.notify }) },
  ideas: { useSheet: (deps: SheetDeps) => useUseItUp(deps.onFoodRecipes) },
  weekPlan: { useSheet: (deps: SheetDeps) => useWeekPlan({ notify: deps.notify }) },
} satisfies Record<SheetName, { useSheet: (deps: SheetDeps) => HostedSheet<never> }>;

export const SHEET_NAMES = Object.keys(SHEETS) as SheetName[];

type SheetOf<N extends SheetName> = ReturnType<(typeof SHEETS)[N]['useSheet']>;
/** What a sheet opens on: a creator, a food, wishes for the week. */
export type SheetInput<N extends SheetName> = Parameters<SheetOf<N>['open']>[0];
export type HostedSheets = { [N in SheetName]: SheetOf<N> };
/** Props for each sheet's component (CreatorSheet, UseItUpSheet, WeekPlanSheet). */
export type SheetsView = { [N in SheetName]: SheetOf<N>['sheet'] };

/**
 * Every registered sheet, each its own hook. The registry is a module constant, so the hooks are called in
 * the same order on every render.
 */
export function useHostedSheets(deps: SheetDeps): HostedSheets {
  const hosted: Partial<Record<SheetName, HostedSheet<never>>> = {};
  for (const name of SHEET_NAMES) hosted[name] = SHEETS[name].useSheet(deps);
  return hosted as HostedSheets;
}

export function sheetsView(hosted: HostedSheets): SheetsView {
  return Object.fromEntries(SHEET_NAMES.map((name) => [name, hosted[name].sheet])) as SheetsView;
}
