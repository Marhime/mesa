// The household's recipes as the worker reads them (service role: every query is scoped to the household).
// A failed read throws: not knowing must never mean importing a recipe the household already has.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SavedRecipes {
  /** The household's newest recipe saved from this link (recipes.source_url), or null. */
  byUrl(householdId: string, url: string): Promise<string | null>;
  /** The recipe an earlier run of this job already wrote (recipes.import_job_id), or null. */
  byJob(householdId: string, jobId: string): Promise<string | null>;
}

const idOf = (data: unknown): string | null => (data as { id: string } | null)?.id ?? null;

export function savedRecipes(db: SupabaseClient): SavedRecipes {
  return {
    async byUrl(householdId, url) {
      const { data, error } = await db
        .from('recipes')
        .select('id')
        .eq('household_id', householdId)
        .eq('source_url', url)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`recipes by link: ${error.message}`);
      return idOf(data);
    },
    async byJob(householdId, jobId) {
      const { data, error } = await db
        .from('recipes')
        .select('id')
        .eq('household_id', householdId)
        .eq('import_job_id', jobId)
        .maybeSingle();
      if (error) throw new Error(`recipes by job: ${error.message}`);
      return idOf(data);
    },
  };
}
