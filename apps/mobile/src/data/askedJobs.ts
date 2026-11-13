// What you asked Mesa for and left to it (askKinds.ts: a creator's videos, ideas for a food, a translation,
// a week plan, a question to Ask Mesa and the videos it looks for): the working bar while it runs, a toast
// when it lands with the app open, and Cancel. Only yours: your partner's questions are theirs (their bar,
// their push).
import type { ImportStatus } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { ASK_KINDS, askKind, askedRecipeId, type AskKind } from './askKinds';
import { useUserId } from './auth';
import { useHouseholdId } from './household';
import { deleteJob, isWorking } from './jobs';
import { ASKED_JOBS_KEY, askJobKey } from './keys';
import { usePoll } from './liveStatus';
import { MINUTE } from './queryClient';
import { useRecipes } from './recipes';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

const POLL_MS = 3_000;
/** A finished one stays listed this long: enough to notice that it finished (the toast). */
const FINISHED_WINDOW_MS = 10 * MINUTE;
const COLUMNS = 'id, kind, status, error, input_text, subject_id, created_at, creator_name:result->creator->>name';

interface AskedRow {
  id: string;
  kind: AskKind;
  status: ImportStatus;
  error: string | null;
  input_text: string | null;
  subject_id: string | null;
  created_at: string;
  /** The creator's name once listed. */
  creator_name: string | null;
}

/** One asked job, in words. */
export interface AskedJobView {
  id: string;
  kind: AskKind;
  /** The recipe it is about (a translation, ingredients read again). */
  recipeId: string | null;
  /** "Ideas for tomato…", "Looking at Food is Love's recipes…", "Translating Tinga…". */
  working: string;
  /** "Ideas for tomato are ready". */
  ready: string;
  /** "Couldn't find ideas for tomato". */
  failed: string;
}

function askedJobView(job: AskedRow, recipeTitle: (id: string) => string | null): AskedJobView {
  const recipeId = askedRecipeId(job.kind, job.subject_id);
  return { id: job.id, kind: job.kind, recipeId, ...askKind(job.kind).words(job, recipeId ? recipeTitle(recipeId) : null) };
}

/** Your asked jobs still working, or finished in the last few minutes; polls every 3 s while one works and live sync is down. */
function useAskedJobs() {
  const householdId = useHouseholdId();
  const userId = useUserId();
  const poll = usePoll(POLL_MS);
  return useQuery({
    queryKey: ASKED_JOBS_KEY,
    enabled: !!householdId && !!userId,
    queryFn: async (): Promise<AskedRow[]> => {
      const since = new Date(Date.now() - FINISHED_WINDOW_MS).toISOString();
      return must(
        await supabase
          .from('import_jobs')
          .select(COLUMNS)
          .in('kind', [...ASK_KINDS])
          .eq('created_by', userId!)
          .or(`status.in.(queued,processing),finished_at.gt.${since}`)
          .order('created_at', { ascending: false })
          .limit(20),
      ) as unknown as AskedRow[];
    },
    refetchInterval: (q) => (poll !== false && q.state.data?.some(isWorking) ? poll : false),
  });
}

/** A recipe's title from the list on the phone (what a translation is about). */
function useRecipeTitle(): (id: string) => string | null {
  const recipes = useRecipes();
  return useMemo(() => {
    const titles = new Map((recipes.data ?? []).map((r) => [r.id, r.title]));
    return (id: string) => titles.get(id) ?? null;
  }, [recipes.data]);
}

/** The working bar: the latest job still working and how many more; null when nothing works. */
export function useAskedWork(): { latest: AskedJobView; more: number } | null {
  const jobs = useAskedJobs();
  const title = useRecipeTitle();
  const working = (jobs.data ?? []).filter(isWorking);
  return working[0] ? { latest: askedJobView(working[0], title), more: working.length - 1 } : null;
}

/** Calls back once when one of your asked jobs finishes or fails while the app is open. Cancelled ones say nothing. */
export function useAskedEvents(on: { ready: (job: AskedJobView) => void; failed: (job: AskedJobView) => void }): void {
  const jobs = useAskedJobs();
  const title = useRecipeTitle();
  const working = useRef<Set<string> | null>(null);
  const callbacks = useRef({ ...on, title });
  callbacks.current = { ...on, title };
  useEffect(() => {
    const data = jobs.data;
    if (!data) return;
    const before = working.current;
    working.current = new Set(data.filter(isWorking).map((j) => j.id));
    if (!before) return;
    for (const j of data) {
      if (!before.has(j.id) || isWorking(j)) continue;
      const view = askedJobView(j, callbacks.current.title);
      if (j.status === 'done') callbacks.current.ready(view);
      else if (j.status === 'failed') callbacks.current.failed(view);
    }
  }, [jobs.data]);
}

/** Cancel: the job is deleted (the worker then sends no push) and leaves the bar at once. */
export function useCancelAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteJob,
    onMutate: (id) => {
      qc.setQueryData<AskedRow[]>(ASKED_JOBS_KEY, (list) => list?.filter((j) => j.id !== id));
    },
    // A sheet following it sees it gone.
    onSuccess: (_data, id) => qc.setQueryData(askJobKey(id), null),
    onSettled: () => refresh(qc, 'asked'),
  });
}
