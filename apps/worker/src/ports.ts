// What each kind of job is given: only what it uses (handlers/index.ts builds these from the worker's
// PipelineDeps). No job sees the configuration (keys, secrets) or the model's provider: the model is an
// interface (model-port.ts), the catalog too (catalog-store.ts). The database is still a client here,
// scoped to the job's household by hand; the reads several jobs share live in repos/.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HouseholdCatalogs } from './catalog-store';
import type { JobMedia } from './job-media';
import type { FileModel, JsonModel, RecipeModel } from './model-port';
import type { YtDlpOptions } from './ytdlp';

/** Ideas, Ask Mesa, Plan my week, tidying: the kitchen's rows, one structured answer, the catalog. */
export interface KitchenJobDeps {
  db: SupabaseClient;
  ai: JsonModel;
  catalog: HouseholdCatalogs;
}

/** A recipe's steps in another language. */
export interface TranslateDeps {
  db: SupabaseClient;
  ai: JsonModel;
}

/** Redo ingredients: the lines named again, then mapped like an import's. */
export interface RereadDeps {
  db: SupabaseClient;
  /** Names for the lines; the parts of a recipe saved without sections. */
  ai: Pick<RecipeModel, 'translateNames'> & JsonModel;
  catalog: HouseholdCatalogs;
}

/** Kitchen Sweep and Ticket In: a photo or a video read into a proposal. */
export interface ScanDeps {
  db: SupabaseClient;
  ai: JsonModel & FileModel;
  catalog: HouseholdCatalogs;
  media: JobMedia;
}

/** A recipe import: pages, videos (yt-dlp), photos, text. It reads; the recipe handler writes. */
export interface ImportDeps {
  ai: RecipeModel & FileModel;
  catalog: HouseholdCatalogs;
  ytdlp: YtDlpOptions;
  media: JobMedia;
}
