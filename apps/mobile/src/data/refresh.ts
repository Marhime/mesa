// What to read again after something changed, by domain event: writers (their onSettled) and live sync
// (live.ts) say what happened, this table says which queries it touches. A new view that depends on an
// event adds its key here, not at every writer.
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import {
  ASKED_JOBS_KEY,
  ASK_JOBS_KEY,
  COVERAGE_KEY,
  CREATOR_NEWS_KEY,
  FOLLOWED_CREATORS_KEY,
  FOR_YOU_KEY,
  GROCERIES_KEY,
  HOUSEHOLD_KEY,
  MEMBERS_KEY,
  PROFILE_KEY,
  IMPORTS_KEY,
  PANTRY_KEY,
  RECIPES_USING_KEY,
  RECIPE_PRODUCTS_KEY,
  SCANS_KEY,
  STAPLES_KEY,
  UP_NEXT_KEY,
  USUAL_KEY,
  AVAILABILITY_KEY,
  askJobKey,
  availabilityKey,
  recipeKeys,
} from './keys';

type Keys = readonly QueryKey[];

const GROCERIES: Keys = [GROCERIES_KEY, USUAL_KEY];
/** The pantry (with its last shopping, a sub-key) and everything computed from it. */
const PANTRY: Keys = [PANTRY_KEY, COVERAGE_KEY, AVAILABILITY_KEY, STAPLES_KEY];
/** What depends on which recipes the household has and what they use. */
const RECIPE_SET: Keys = [recipeKeys.list, COVERAGE_KEY, RECIPES_USING_KEY, RECIPE_PRODUCTS_KEY];

const EVENTS = {
  /** Who you are and which kitchen you're in (a name, a new household). */
  profile: () => [PROFILE_KEY, MEMBERS_KEY],
  /** The kitchen's name and default servings. */
  household: () => [HOUSEHOLD_KEY],
  /** The grocery list changed. */
  groceries: () => GROCERIES,
  /** Something went in or out of the pantry, or a staple changed. */
  pantry: () => PANTRY,
  /** Bought, or already at home: the list and the pantry. */
  'groceries.stocked': () => [...GROCERIES, ...PANTRY],
  /** A recipe was added or deleted (saved, imported, from the other phone). */
  recipes: () => RECIPE_SET,
  /** One recipe changed: its fields, its ingredient lines (new ids after a save), what is at home for it. */
  recipe: ({ recipeId }: { recipeId: string }) => [...RECIPE_SET, recipeKeys.detail(recipeId), availabilityKey(recipeId)],
  /** Some recipe changed and which one is unknown. */
  'recipes.any': () => [...RECIPE_SET, recipeKeys.details, AVAILABILITY_KEY],
  /** A heart set or cleared. */
  favorite: () => [recipeKeys.list],
  /** On the menu changed (from the other phone). */
  upNext: () => [UP_NEXT_KEY],
  /** Planned or unplanned here: the menu and what it put on the list. */
  menu: () => [UP_NEXT_KEY, ...GROCERIES],
  /** Cooked: the pantry it used, what ran out (the list), the menu, when it was last cooked. */
  cooked: () => [...PANTRY, ...GROCERIES, UP_NEXT_KEY, recipeKeys.list],
  imports: () => [IMPORTS_KEY],
  scans: () => [SCANS_KEY],
  /** A scan or a receipt applied: the pantry, the list and the inbox. */
  'scans.applied': () => [...PANTRY, ...GROCERIES, SCANS_KEY],
  /** The working bar. */
  asked: () => [ASKED_JOBS_KEY],
  /** One asked job and the working bar. */
  askJob: ({ jobId }: { jobId: string }) => [askJobKey(jobId), ASKED_JOBS_KEY],
  /** Some job changed and which one is unknown (deleted, or live sync came back). */
  jobs: () => [IMPORTS_KEY, SCANS_KEY, ASKED_JOBS_KEY, ASK_JOBS_KEY],
  creators: () => [FOLLOWED_CREATORS_KEY],
  creatorNews: () => [CREATOR_NEWS_KEY],
  forYou: () => [FOR_YOU_KEY],
} satisfies Record<string, (params: never) => Keys>;

export type RefreshEvent = keyof typeof EVENTS;
type ParamsOf<E extends RefreshEvent> = Parameters<(typeof EVENTS)[E]>;
/** One event and its parameters, as live sync collects them. */
export type RefreshCall = { [E in RefreshEvent]: [E, ...ParamsOf<E>] }[RefreshEvent];

/** The keys an event touches. */
export function refreshKeys<E extends RefreshEvent>(event: E, ...params: ParamsOf<E>): Keys {
  return keysOf([event, ...params] as unknown as RefreshCall);
}

function keysOf([event, ...params]: RefreshCall): Keys {
  return (EVENTS[event] as (...p: unknown[]) => Keys)(...params);
}

/** Marks what the event touches as stale; what is on screen reads again. */
export function refresh<E extends RefreshEvent>(qc: QueryClient, event: E, ...params: ParamsOf<E>): void {
  for (const queryKey of refreshKeys(event, ...params)) void qc.invalidateQueries({ queryKey });
}

/** Several events at once, each key once. */
export function refreshAll(qc: QueryClient, calls: readonly RefreshCall[]): void {
  const seen = new Set<string>();
  for (const call of calls) {
    for (const queryKey of keysOf(call)) {
      const id = JSON.stringify(queryKey);
      if (seen.has(id)) continue;
      seen.add(id);
      void qc.invalidateQueries({ queryKey });
    }
  }
}
