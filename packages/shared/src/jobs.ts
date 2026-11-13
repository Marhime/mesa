// import_jobs rows: what the app and the server queue, and what the worker writes while it runs them.
// What each kind is (lane, quota, failure, pushes) lives in job-kinds.ts.
import type { ImportKind } from './job-kinds';
import type { ImportPlatform, Zone } from './rows';

export type ImportStatus = 'queued' | 'processing' | 'done' | 'failed';
export type ImportStage = 'opening' | 'downloading' | 'watching' | 'reading' | 'writing';

export interface ImportJob {
  id: string;
  household_id: string;
  kind: ImportKind;
  /** The zone a sweep films. */
  zone: Zone | null;
  /** The pantry proposal a sweep / receipt produced. */
  proposal_id: string | null;
  /** What a tidy / idea / translate / reread job is about: a product, a grocery line, a recipe. */
  subject_id?: string | null;
  /** Several screenshots of one recipe (input_image_path is the first one). */
  input_image_paths?: string[] | null;
  /** An asked job's answer (JobResults in results.ts). */
  result?: unknown;
  /** Ask Mesa: earlier turns, newest last. */
  input_context?: { q: string; a: string }[] | null;
  /** Ask Mesa: the answer's words so far while the worker writes them; null otherwise. */
  draft?: string | null;
  input_url: string | null;
  input_text: string | null;
  input_image_path: string | null;
  platform: ImportPlatform | null;
  status: ImportStatus;
  error: string | null;
  attempts: number;
  recipe_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  /** What the worker is doing now; null while queued. */
  stage: ImportStage | null;
  stage_at: string | null;
  /** Known early (page or video title, thumbnail), before the recipe is written. */
  preview_title: string | null;
  preview_image_url: string | null;
  /** Why it failed, for the right way out (an ErrorCode, see errors.ts). */
  error_code: string | null;
  /** Who asked for it: the progress, the ready card and the pushes are theirs. Null: the server queued it. */
  created_by: string | null;
  /** Done without importing: the link was already a recipe of the household (recipe_id). */
  already_saved: boolean;
  /** The worker lane that claimed it last ('any' or 'quick'); null until claimed. */
  claimed_lane?: 'any' | 'quick' | null;
}
