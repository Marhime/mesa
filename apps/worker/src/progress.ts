// What a job is doing right now, written to import_jobs so the app can show a real progression
// ("Getting the video", "Watching the video"…) and an early preview (title, thumbnail).
// Best effort: a failed write is logged and never fails or slows the import.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportStage } from '@mesa/shared';
import type { Logger } from './log';

/** import_jobs.stage (the shared ImportStage). */
export type Stage = ImportStage;

export interface Preview {
  title?: string | null;
  imageUrl?: string | null;
}

export interface Progress {
  stage(stage: Stage): void;
  preview(preview: Preview): void;
  /** Resolves once every write sent so far has landed (before the job is marked done). */
  flush(): Promise<void>;
}

const MAX_TITLE = 200;
/** Titles that say nothing about the dish: "Video by chef_x", "Instagram", "TikTok · Make Your Day". */
const GENERIC_TITLE = /^(?:(?:video|post|reel|photo)s? by\b|instagram$|tiktok\b|youtube$)/i;

/** Writes are chained so they land in order; each one is independent of the others' success. */
export function jobProgress(db: SupabaseClient, jobId: string, log: Logger): Progress {
  let chain: Promise<void> = Promise.resolve();
  let titled = false;
  const write = (patch: Record<string, unknown>, what: string) => {
    chain = chain.then(async () => {
      try {
        const { error } = await db.from('import_jobs').update(patch).eq('id', jobId);
        if (error) log.warn('progress_write_failed', { what, err: error.message });
      } catch (err) {
        log.warn('progress_write_failed', { what, err });
      }
    });
  };
  return {
    stage(stage) {
      write({ stage, stage_at: new Date().toISOString() }, stage);
    },
    preview({ title, imageUrl }) {
      const patch: Record<string, unknown> = {};
      const t = title?.trim();
      // The first real title wins: a later page title is usually worse ("Instagram").
      if (t && !titled && !GENERIC_TITLE.test(t)) {
        patch.preview_title = t.slice(0, MAX_TITLE);
        titled = true;
      }
      if (imageUrl && /^https:\/\//.test(imageUrl)) patch.preview_image_url = imageUrl;
      if (Object.keys(patch).length > 0) write(patch, 'preview');
    },
    flush: () => chain,
  };
}

/** For tests and callers that don't report progress. */
export const noProgress: Progress = {
  stage: () => undefined,
  preview: () => undefined,
  flush: () => Promise.resolve(),
};
