import type { ImportJob } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { isUrl, normalizeUrl, platformOfUrl } from '../lib/text';
import { useHouseholdId } from './household';
import { uploadRecipeImage, type LocalImage } from './media';
import { recipeKeys } from './recipes';
import { must, supabase } from './supabase';

export const IMPORTS_KEY = ['imports'] as const;
const KEY = IMPORTS_KEY;
const POLL_MS = 3_000;

export type ImportView = Pick<ImportJob, 'id' | 'input_url' | 'input_text' | 'input_image_path' | 'status' | 'error' | 'created_at'>;

function isActive(j: ImportView): boolean {
  return j.status === 'queued' || j.status === 'processing';
}

/** Imports that are not done yet (queued, processing or failed). Polls every 3 s while any is working. */
export function useImportJobs() {
  const householdId = useHouseholdId();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<ImportView[]> =>
      must(
        await supabase
          .from('import_jobs')
          .select('id, input_url, input_text, input_image_path, status, error, created_at')
          .eq('kind', 'recipe')
          .neq('status', 'done')
          .order('created_at', { ascending: false })
          .limit(20),
      ) as ImportView[],
    refetchInterval: (q) => (q.state.data?.some(isActive) ? POLL_MS : false),
  });

  // A job that left the list finished: its recipe is ready.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set((query.data ?? []).filter(isActive).map((j) => j.id));
    let finished = false;
    for (const id of seen.current) if (!ids.has(id)) finished = true;
    seen.current = ids;
    if (finished) void qc.invalidateQueries({ queryKey: recipeKeys.list });
  }, [query.data, qc]);

  return query;
}

/** "YouTube", "bonappetit.com", "Screenshot", "Pasted text". */
export function importSource(job: Pick<ImportView, 'input_url' | 'input_image_path'>): string {
  if (job.input_url) return platformOfUrl(job.input_url) ?? 'Link';
  if (job.input_image_path) return 'Screenshot';
  return 'Pasted text';
}

export type ImportInput = { url: string } | { text: string } | { image: LocalImage };

/** What Mesa reads while it imports, in a sentence. */
export function importReading(input: ImportInput): string {
  if ('image' in input) return 'Reading the recipe in your screenshot';
  if ('text' in input) return 'Reading the recipe you shared';
  const platform = platformOfUrl(input.url);
  if (platform === 'YouTube' || platform === 'Instagram' || platform === 'TikTok') {
    return 'Reading the ingredients written on screen, the voice-over and the description';
  }
  return 'Reading the recipe on the page';
}

/** A link, text, or image to import. Text that is just a link becomes a link. */
export function importInputFromText(text: string): ImportInput {
  const t = text.trim();
  return isUrl(t) ? { url: normalizeUrl(t) } : { text: t };
}

/** Creates an import job; the worker picks it up. Images are resized and uploaded first. */
export function useCreateImport() {
  const qc = useQueryClient();
  const householdId = useHouseholdId();
  return useMutation({
    mutationFn: async (input: ImportInput) => {
      let row: { input_url?: string; input_text?: string; input_image_path?: string };
      if ('url' in input) row = { input_url: input.url };
      else if ('text' in input) row = { input_text: input.text };
      else {
        if (!householdId) throw new Error('No household');
        row = { input_image_path: await uploadRecipeImage(input.image, householdId) };
      }
      return must(await supabase.from('import_jobs').insert(row).select('id, input_url, input_text, input_image_path, status, error, created_at').single()) as ImportView;
    },
    onSuccess: (job) => {
      qc.setQueryData<ImportView[]>(KEY, (list) => [job, ...(list ?? []).filter((j) => j.id !== job.id)]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRetryImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('import_jobs').update({ status: 'queued', error: null }).eq('id', id));
    },
    onMutate: (id) => {
      qc.setQueryData<ImportView[]>(KEY, (list) => list?.map((j) => (j.id === id ? { ...j, status: 'queued', error: null } : j)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface ImportPanelItem {
  id: string;
  source: string;
  status: 'queued' | 'processing' | 'failed';
  error: string | null;
}

/** Everything a screen needs to show pending imports with Retry and Remove. */
export function useImportsPanel() {
  const jobs = useImportJobs();
  const retry = useRetryImport();
  const remove = useRemoveImport();
  const items: ImportPanelItem[] = (jobs.data ?? [])
    .filter((j): j is ImportView & { status: ImportPanelItem['status'] } => j.status !== 'done')
    .map((j) => ({ id: j.id, source: importSource(j), status: j.status, error: j.error }));
  return {
    items,
    retry: (id: string) => retry.mutate(id),
    remove: (id: string) => remove.mutate(id),
    retryingId: retry.isPending ? retry.variables : undefined,
    refetch: jobs.refetch,
  };
}

export function useRemoveImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      must(await supabase.from('import_jobs').delete().eq('id', id));
    },
    onMutate: (id) => {
      qc.setQueryData<ImportView[]>(KEY, (list) => list?.filter((j) => j.id !== id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
