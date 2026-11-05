// Query keys shared across data modules, and what to refresh when the pantry changes.
import type { QueryClient } from '@tanstack/react-query';

export const GROCERIES_KEY = ['groceries'] as const;
export const PANTRY_KEY = ['pantry'] as const;
export const PANTRY_UPDATED_KEY = ['pantry', 'updated'] as const;
export const COVERAGE_KEY = ['coverage'] as const;
export const AVAILABILITY_KEY = ['availability'] as const;
export const STAPLES_KEY = ['staples'] as const;
export const cookedKey = (recipeId: string) => ['cooked', recipeId] as const;

/** Everything computed from the pantry: the pantry itself, recipe coverage, per-ingredient status, staples. */
export function refreshPantryViews(qc: QueryClient): void {
  for (const key of [PANTRY_KEY, COVERAGE_KEY, AVAILABILITY_KEY, STAPLES_KEY]) void qc.invalidateQueries({ queryKey: key });
}
