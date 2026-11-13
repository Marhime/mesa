// Recipe imports: what you shared, where each one stands, and the reads and writes behind them.
// Only your own shares are listed (your partner's recipes simply arrive in Recipes).
import type { ImportJob } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { isUrl, normalizeUrl } from '../lib/text';
import { useUserId } from './auth';
import { useHouseholdId } from './household';
import { deleteJob, isWorking } from './jobs';
import { IMPORTS_KEY } from './keys';
import { usePoll } from './liveStatus';
import { uploadImageShownToMesa, type LocalImage } from './media';
import { MINUTE } from './queryClient';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

export { IMPORTS_KEY };
const KEY = IMPORTS_KEY;
const POLL_MS = 3_000;
/** A finished import stays listed this long, as a "ready" card until it is opened or dismissed. */
const READY_WINDOW_MS = 30 * MINUTE;
const MAX_PREVIEW_TITLE = 200;

const COLUMNS =
  'id, input_url, input_text, input_image_path, input_image_paths, status, error, error_code, stage, stage_at, preview_title, preview_image_url, ' +
  'created_at, finished_at, recipe_id, proposal_id, already_saved, recipe:recipes(title, image_path)';

export type ImportView = Pick<
  ImportJob,
  | 'id'
  | 'input_url'
  | 'input_text'
  | 'input_image_path'
  | 'input_image_paths'
  | 'status'
  | 'error'
  | 'error_code'
  | 'stage'
  | 'stage_at'
  | 'preview_title'
  | 'preview_image_url'
  | 'created_at'
  | 'finished_at'
  | 'recipe_id'
  | 'proposal_id'
  | 'already_saved'
> & { recipe: { title: string; image_path: string | null } | null };

/** True when a job that was working in `before` is no longer working (or listed) in `after`. */
function someFinished(before: ImportView[] | undefined, after: ImportView[]): boolean {
  const working = new Set(after.filter(isWorking).map((j) => j.id));
  return (before ?? []).some((j) => isWorking(j) && !working.has(j.id));
}

/**
 * Your imports that are working, failed, or finished in the last half hour. Live sync brings their
 * progress; a 3 s poll stands in while it is down. A read that sees one finish refreshes the recipes.
 */
export function useImportJobs() {
  const householdId = useHouseholdId();
  const userId = useUserId();
  const qc = useQueryClient();
  const poll = usePoll(POLL_MS);
  return useQuery({
    queryKey: KEY,
    enabled: !!householdId && !!userId,
    queryFn: async (): Promise<ImportView[]> => {
      const since = new Date(Date.now() - READY_WINDOW_MS).toISOString();
      const jobs = must(
        await supabase
          .from('import_jobs')
          .select(COLUMNS)
          .eq('kind', 'recipe')
          .or(`created_by.eq.${userId},created_by.is.null`)
          .or(`status.neq.done,finished_at.gt.${since}`)
          .order('created_at', { ascending: false })
          .limit(20),
      ) as unknown as ImportView[];
      // Once, whoever shows the list: a finished import wrote its recipe.
      if (someFinished(qc.getQueryData<ImportView[]>(KEY), jobs)) refresh(qc, 'recipes');
      return jobs;
    },
    refetchInterval: (q) => (poll !== false && q.state.data?.some(isWorking) ? poll : false),
  });
}

/** A link (with the post's caption and title when shared from an app), a text, or 1 to 4 screenshots of one recipe. */
export type ImportInput = { url: string; text?: string | null; title?: string | null } | { text: string } | { images: LocalImage[] };

/** A link, or text that is just a link, becomes a link import. */
export function importInputFromText(text: string): ImportInput {
  const t = text.trim();
  return isUrl(t) ? { url: normalizeUrl(t) } : { text: t };
}

type ImportRow = { input_url?: string; input_text?: string; input_image_path?: string; input_image_paths?: string[]; preview_title?: string };

/** Uploads every screenshot (in order, private); one job reads them together. One screenshot is a row like before. */
async function screenshotsRow(images: LocalImage[], householdId: string): Promise<ImportRow> {
  if (images.length === 0) throw new Error('No screenshot');
  const paths = await Promise.all(images.map((image) => uploadImageShownToMesa(image, householdId)));
  return paths.length > 1 ? { input_image_path: paths[0], input_image_paths: paths } : { input_image_path: paths[0] };
}

function importRow(input: ImportInput, householdId: string | null): Promise<ImportRow> {
  if ('url' in input) {
    const title = input.title?.trim();
    return Promise.resolve({
      input_url: input.url,
      // The caption is context for the reader, and the fallback when the video can't be had.
      input_text: input.text?.trim() || undefined,
      preview_title: title && title.length <= MAX_PREVIEW_TITLE ? title : undefined,
    });
  }
  if ('text' in input) return Promise.resolve({ input_text: input.text });
  if (!householdId) throw new Error('No household');
  return screenshotsRow(input.images, householdId);
}

async function insertImport(input: ImportInput, householdId: string | null): Promise<ImportView> {
  const row = await importRow(input, householdId);
  return must(await supabase.from('import_jobs').insert(row).select(COLUMNS).single()) as unknown as ImportView;
}

/** The new job shows in the list right away (its "Saving" row), before the next poll. */
function listImport(qc: QueryClient, job: ImportView): void {
  qc.setQueryData<ImportView[]>(KEY, (list) => [job, ...(list ?? []).filter((j) => j.id !== job.id)]);
}

/** Creates an import job; the worker picks it up. Images are resized and uploaded first. */
export function useCreateImport() {
  const qc = useQueryClient();
  const householdId = useHouseholdId();
  return useMutation({
    mutationFn: (input: ImportInput) => insertImport(input, householdId),
    onSuccess: (job) => listImport(qc, job),
    onSettled: () => refresh(qc, 'imports'),
  });
}

/** How a batch of imports went: how many started, and why the rest did not (null when all did). */
export interface ImportBatchResult {
  started: number;
  error: unknown;
}

/**
 * One import per link, one after the other (videos picked from a creator). Stops at the first refusal
 * (the daily cap, offline): the ones already started keep going.
 */
export function useImportVideos() {
  const qc = useQueryClient();
  const householdId = useHouseholdId();
  return useMutation({
    mutationFn: async (links: { url: string; title?: string | null }[]): Promise<ImportBatchResult> => {
      let started = 0;
      for (const link of links) {
        try {
          listImport(qc, await insertImport({ url: link.url, title: link.title }, householdId));
          started++;
        } catch (error) {
          return { started, error };
        }
      }
      return { started, error: null };
    },
    onSettled: () => refresh(qc, 'imports'),
  });
}

const REQUEUE = { status: 'queued', error: null, error_code: null, stage: null, stage_at: null } as const;

/**
 * Try again: a failed import back in the queue (the only change the app may make to a job: import_job_rules;
 * it takes one of the day's imports). A job no longer failed is left alone, so a second tap does nothing.
 */
export function useRetryImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('import_jobs').update(REQUEUE).eq('id', id).eq('status', 'failed'));
    },
    onMutate: (id) => {
      qc.setQueryData<ImportView[]>(KEY, (list) => list?.map((j) => (j.id === id ? { ...j, ...REQUEUE } : j)));
    },
    onSettled: () => refresh(qc, 'imports'),
  });
}

export function useRemoveImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteJob,
    onMutate: (id) => {
      qc.setQueryData<ImportView[]>(KEY, (list) => list?.filter((j) => j.id !== id));
    },
    onSettled: () => refresh(qc, 'imports'),
  });
}
