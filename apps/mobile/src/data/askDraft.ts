// Ask Mesa's answer as it is written: the worker keeps the words so far in import_jobs.draft and live sync
// hands each change straight to the screen, with no refetch (live.ts). Kept apart from the job's own cache,
// which the 2 s poll refreshes without the draft.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { askDraftKey } from './keys';

/**
 * A changed import_jobs row (Realtime's copy): an Ask Mesa answer being written goes to its draft and
 * nothing else needs refreshing (true). Anything else is left to the usual refresh (false).
 */
export function applyAskDraft(qc: QueryClient, row: Record<string, unknown>): boolean {
  if (row.kind !== 'ask' || row.status !== 'processing' || typeof row.id !== 'string' || typeof row.draft !== 'string') return false;
  qc.setQueryData(askDraftKey(row.id), row.draft);
  return true;
}

/** The words written so far for that question; null before the first ones (or without a job). */
export function useAskDraft(jobId: string | null): string | null {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: askDraftKey(jobId ?? ''),
    queryFn: () => qc.getQueryData<string>(askDraftKey(jobId ?? '')) ?? null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
  });
  return jobId ? data : null;
}
