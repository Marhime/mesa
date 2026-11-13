// Things people ask the worker for (askKinds.ts): one import_jobs row per question (a recent one is
// reused), followed until it is done or failed: live sync brings its changes, a 2 s poll stands in while
// it is down. Nobody has to wait for it: the job keeps going when its sheet or screen is left (askedJobs.ts
// shows it in the working bar and says when it lands).
import type { ImportJob } from '@mesa/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import type { AskKind } from './askKinds';
import { useUserId } from './auth';
import { isWorking } from './jobs';
import { askJobKey } from './keys';
import { usePoll } from './liveStatus';
import { MINUTE } from './queryClient';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

export { ASK_KINDS, type AskKind } from './askKinds';
export { askJobKey, ASK_JOBS_KEY } from './keys';

export type AskJob = Pick<ImportJob, 'id' | 'status' | 'error' | 'error_code' | 'result' | 'input_text' | 'input_url' | 'subject_id'>;
/** idle: nothing asked yet · working · done · failed (the job, or queuing it) · cancelled (the job was deleted). */
export type AskPhase = 'idle' | 'working' | 'done' | 'failed' | 'cancelled';

/** What a question is about: the columns it is written in (and recognised by, to reuse an answer). */
export interface AskQuestion {
  /** The product or recipe it is about. */
  subjectId?: string;
  /** The food's name, the language code. */
  input?: string;
  /** A link it is about (a creator's channel). */
  url?: string;
  /** What to call it while it works (a creator's name): kept on a new job, never used to recognise one. */
  label?: string | null;
  /** Earlier turns of a conversation (Ask Mesa), newest last: kept on a new job, never used to recognise one. */
  context?: { q: string; a: string }[];
  /** Reuse a job answered in the last hour (else only one still working). */
  reuseDone: boolean;
}

/** The import_jobs columns a question is recognised by; only the ones it sets. */
function askColumns(q: AskQuestion): Record<string, string> {
  const columns: Record<string, string> = {};
  if (q.subjectId !== undefined) columns.subject_id = q.subjectId;
  if (q.input !== undefined) columns.input_text = q.input;
  if (q.url !== undefined) columns.input_url = q.url;
  return columns;
}

const COLUMNS = 'id, status, error, error_code, result, input_text, input_url, subject_id';
const POLL_MS = 2_000;
const REUSE_WINDOW_MS = 60 * MINUTE;

/** Follows one asked job by id, polling while it works (`poll`: false while live sync is up); null once it is gone (cancelled). */
export const askJobQuery = (id: string, poll: number | false) =>
  queryOptions({
    queryKey: askJobKey(id),
    gcTime: 10 * MINUTE,
    queryFn: async (): Promise<AskJob | null> =>
      must(await supabase.from('import_jobs').select(COLUMNS).eq('id', id).maybeSingle()) as AskJob | null,
    refetchInterval: (query) => (poll !== false && isWorking(query.state.data) ? poll : false),
  });

/** The poll for asked jobs: none while live sync is up. */
export function useAskJobPoll(): number | false {
  return usePoll(POLL_MS);
}

/**
 * The newest job asking the same thing in the last hour that is still working (or done, when allowed).
 * A job still working is reused only when it is yours: someone else's would run without you hearing of it.
 */
async function recentJob(kind: AskKind, q: AskQuestion, userId: string | null): Promise<AskJob | null> {
  const since = new Date(Date.now() - REUSE_WINDOW_MS).toISOString();
  let query = supabase
    .from('import_jobs')
    .select(COLUMNS)
    .eq('kind', kind)
    .match(askColumns(q))
    .in('status', q.reuseDone ? ['queued', 'processing', 'done'] : ['queued', 'processing'])
    .gt('created_at', since);
  if (userId) query = query.or(`status.eq.done,created_by.eq.${userId}`);
  const rows = must(await query.order('created_at', { ascending: false }).limit(1)) as AskJob[];
  return rows[0] ?? null;
}

async function askWorker(kind: AskKind, q: AskQuestion, userId: string | null): Promise<AskJob> {
  const recent = await recentJob(kind, q, userId);
  if (recent) return recent;
  const label = q.input === undefined && q.label?.trim() ? { input_text: q.label.trim() } : {};
  return must(
    await supabase
      .from('import_jobs')
      .insert({ kind, ...askColumns(q), ...label, ...(q.context?.length ? { input_context: q.context } : {}) })
      .select(COLUMNS)
      .single(),
  ) as AskJob;
}

/** Queues a question (or picks up the same one asked recently); the working bar lists it right away. */
export function useStartAsk(kind: AskKind) {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (q: AskQuestion) => askWorker(kind, q, userId),
    onSuccess: (job) => {
      qc.setQueryData(askJobKey(job.id), job);
      refresh(qc, 'asked');
    },
  });
}

/** Where a job stands, from how queuing it went and its row (undefined while it loads, null once deleted). */
export function askPhase(q: { queuing: boolean; queueError: unknown; jobId: string | null; job: AskJob | null | undefined }): AskPhase {
  if (q.queuing) return 'working';
  if (q.queueError) return 'failed';
  if (!q.jobId) return 'idle';
  if (q.job === null) return 'cancelled';
  if (q.job?.status === 'done') return 'done';
  if (q.job?.status === 'failed') return 'failed';
  return 'working';
}

/** One asked job followed by useWorkerAsk. `ask`, `follow` and `reset` never change. */
export interface WorkerAsk {
  phase: AskPhase;
  job: AskJob | null;
  /** The job followed (null until it is queued). */
  jobId: string | null;
  /** Why queuing it failed (offline, too many today); null when the job itself failed or all went well. */
  askError: unknown;
  /** Only the latest question is followed. */
  ask: (q: AskQuestion) => void;
  /** Follow a job asked earlier, by id. */
  follow: (jobId: string) => void;
  /** Forget the question (another food, another recipe). */
  reset: () => void;
}

/**
 * Asks the worker one thing at a time and follows the answer, however long it takes (the worker fails a
 * job itself when it can't finish). `ask` again (Try again) reuses a job still working; an empty answer
 * is asked anew with `reuseDone: false`. `follow(jobId)` picks up a job asked earlier (a notification).
 */
export function useWorkerAsk(kind: AskKind): WorkerAsk {
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const start = useStartAsk(kind);
  const poll = useAskJobPoll();
  const watched = useQuery({ ...askJobQuery(trackedId ?? '', poll), enabled: !!trackedId });
  const { mutate, reset: resetStart } = start;

  const ask = useCallback((q: AskQuestion) => mutate(q, { onSuccess: (asked) => setTrackedId(asked.id) }), [mutate]);
  const follow = useCallback(
    (jobId: string) => {
      resetStart();
      setTrackedId(jobId);
    },
    [resetStart],
  );
  const reset = useCallback(() => {
    resetStart();
    setTrackedId(null);
  }, [resetStart]);

  const job = trackedId ? (watched.data ?? null) : null;
  const askError = start.isError ? start.error : null;
  const phase = askPhase({ queuing: start.isPending, queueError: askError, jobId: trackedId, job: trackedId ? watched.data : undefined });
  return useMemo(() => ({ phase, job, jobId: trackedId, askError, ask, follow, reset }), [phase, job, trackedId, askError, ask, follow, reset]);
}
