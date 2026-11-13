// The videos Ask Mesa looks for during a conversation: when an answer says `find`, the app runs a 'find'
// job at once (no tap) and shows what comes back under that answer (FoundVideos, each with why): Save one
// (an import), Watch it first. Each answer has its own search; they keep going when the sheet is closed
// (the working pill, then a toast or a push, which reopen Ask Mesa on that search).
import type { FoundVideos } from '@mesa/shared';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { askOutcome } from './askOutcome';
import { foundVideoView, isSavedVideo, savedVideoIds, type FoundVideoView } from './foundVideo';
import { useRecipes } from './recipes';
import { useSaveVideo } from './saveVideo';
import { useOpenInApp } from './system';
import { askJobQuery, askPhase, useAskJobPoll, useStartAsk, type AskJob } from './workerAsk';

const MAX_VIDEOS = 5;
const MAX_QUERY = 120;
const NONE: ReadonlySet<string> = new Set();

/** A found video under an answer: already in Recipes or saved from here, or being saved. */
export interface AskVideoView extends FoundVideoView {
  saved: boolean;
  saving: boolean;
}

/** One search, ready to show under its answer. */
export interface AskFindView {
  /** What Mesa looks for ("spicy chicken, 30 min"); empty while a search opened by its job loads. */
  query: string;
  state: 'working' | 'ready' | 'failed';
  videos: AskVideoView[];
  /** Why there is nothing to show (the worker's words, no videos, cancelled). */
  message: string | null;
  /** Looking again can work today (not after Mesa's daily limit). */
  canRetry: boolean;
}

interface Run {
  query: string;
  jobId: string | null;
  /** Queuing it failed (offline, too many today). */
  error: unknown;
}

/** "spicy  chicken, 30 min " → "spicy chicken, 30 min". */
export function findQuery(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
}

/** A find job's answer, read defensively: up to five videos with a link, a title and a why, once each. */
export function foundVideos(result: unknown): FoundVideoView[] {
  const videos = (result as Partial<FoundVideos> | null | undefined)?.videos;
  if (!Array.isArray(videos)) return [];
  const seen = new Set<string>();
  const views: FoundVideoView[] = [];
  for (const v of videos) {
    const view = foundVideoView(v);
    if (!view || seen.has(view.url)) continue;
    seen.add(view.url);
    views.push(view);
  }
  return views.slice(0, MAX_VIDEOS);
}

/** Where a search stands, from its job (undefined while it loads, null once deleted). */
function findState(run: Run, job: AskJob | null | undefined, query: string): Pick<AskFindView, 'state' | 'message' | 'canRetry'> & { found: FoundVideoView[] } {
  const phase = askPhase({ queuing: !run.jobId && !run.error, queueError: run.error, jobId: run.jobId, job });
  const found = phase === 'done' ? foundVideos(job?.result) : [];
  const outcome = askOutcome({ phase, job, askError: run.error }, found.length > 0, {
    notAsked: "Couldn't ask Mesa. Try again.",
    failed: "Couldn't find videos right now.",
    empty: `No recipe videos for ${query || 'that'} this time.`,
  });
  return { ...outcome, found };
}

/**
 * The conversation's searches, by turn: `start(turn, query)` looks once per turn, `follow(turn, jobId)`
 * shows a search asked earlier, `view(turn)` is ready for its answer.
 */
export function useAskFinds({ onError }: { onError: (message: string) => void }) {
  const [runs, setRuns] = useState<ReadonlyMap<string, Run>>(new Map());
  const started = useRef(new Set<string>());
  const [savedHere, setSavedHere] = useState<ReadonlySet<string>>(NONE);
  const { mutateAsync: startAsk } = useStartAsk('find');
  const recipes = useRecipes();
  const saver = useSaveVideo(onError);
  const openInApp = useOpenInApp();
  const poll = useAskJobPoll();

  const ids = useMemo(() => [...runs.values()].flatMap((r) => (r.jobId ? [r.jobId] : [])), [runs]);
  const jobs = useQueries({ queries: ids.map((id) => askJobQuery(id, poll)) });
  const jobOf = (id: string | null) => (id ? jobs[ids.indexOf(id)]?.data : undefined);
  const inRecipes = useMemo(() => savedVideoIds(recipes.data ?? []), [recipes.data]);
  /** The search job under each turn (kept with the conversation). */
  const jobIds = useMemo(() => new Map([...runs].flatMap(([turn, r]) => (r.jobId ? [[turn, r.jobId] as const] : []))), [runs]);

  const look = useCallback(
    (turn: string, query: string, reuseDone: boolean) => {
      const patch = (change: Partial<Run>) =>
        setRuns((prev) => {
          const run = prev.get(turn);
          return run ? new Map(prev).set(turn, { ...run, ...change }) : prev;
        });
      setRuns((prev) => new Map(prev).set(turn, { query, jobId: null, error: null }));
      startAsk({ input: query, reuseDone })
        .then((job) => patch({ jobId: job.id }))
        .catch((error: unknown) => patch({ error }));
    },
    [startAsk],
  );

  const view = (turn: string): AskFindView | null => {
    const run = runs.get(turn);
    if (!run) return null;
    const job = jobOf(run.jobId);
    const query = run.query || job?.input_text?.trim() || '';
    const { state, message, canRetry, found } = findState(run, job, query);
    const videos = found.map((v) => ({ ...v, saved: savedHere.has(v.url) || isSavedVideo(v.url, inRecipes), saving: saver.saving === v.url }));
    return { query, state, message, canRetry, videos };
  };
  const videoOf = (turn: string, key: string) => view(turn)?.videos.find((v) => v.key === key);
  const start = useCallback(
    (turn: string, words: string) => {
      const query = findQuery(words);
      if (query === '' || started.current.has(turn)) return;
      started.current.add(turn);
      look(turn, query, true);
    },
    [look],
  );
  const follow = useCallback((turn: string, jobId: string) => {
    started.current.add(turn);
    setRuns((prev) => new Map(prev).set(turn, { query: '', jobId, error: null }));
  }, []);
  const reset = useCallback(() => {
    started.current.clear();
    setRuns(new Map());
  }, []);

  return {
    view,
    /** Looks for these words under that answer, once (the same search in the last hour is answered already). Never changes. */
    start,
    /** A search asked earlier (the pill, a toast, a push), shown under that turn. Never changes. */
    follow,
    /** The search job under each turn (kept with the conversation); a turn is missing before its job is queued. */
    jobIds,
    /** True when this job is one of the conversation's searches. */
    holds: (jobId: string) => ids.includes(jobId),
    /** A search still looking (leaving is the moment to offer notifications). */
    working: [...runs.keys()].some((turn) => view(turn)?.state === 'working'),
    // Nothing came back: asked anew; a job still working is picked up.
    retry: (turn: string) => {
      const run = runs.get(turn);
      const query = run?.query || jobOf(run?.jobId ?? null)?.input_text?.trim() || '';
      if (query !== '') look(turn, query, false);
    },
    save: (turn: string, key: string) => {
      const video = videoOf(turn, key);
      if (!video || video.saved) return;
      saver.save(video.url, video, () => setSavedHere((prev) => new Set([...prev, video.url])));
    },
    watch: (turn: string, key: string) => {
      const video = videoOf(turn, key);
      if (video) openInApp(video.url);
    },
    /** A new conversation: its searches are no longer shown (they keep going). Never changes. */
    reset,
  };
}
