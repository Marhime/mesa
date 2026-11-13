// "Ideas for the tomatoes": a Use soon food opens a sheet of dishes that use it. The worker answers an
// 'idea' job in import_jobs.result (UseItUpIdeas); each idea can be looked up as a video, and the
// household's own recipes with that food stay one tap away. One sheet for the app (askSheets.tsx);
// closing it while Mesa thinks leaves the job running (the working bar, then a toast or a push).
import type { UseItUpIdeas } from '@mesa/shared';
import { useState } from 'react';

import { formatMinutes, listLine } from '../lib/text';
import { askOutcome, useLeavable } from './askOutcome';
import { useOpenUrl } from './system';
import { useWorkerAsk, type AskJob } from './workerAsk';

const MAX_IDEAS = 3;

/** The food a Use soon card is about. */
export interface UseItUpFood {
  productId: string;
  name: string;
}

/** One idea, ready to show. */
export interface UseItUpIdeaView {
  key: string;
  title: string;
  /** "Uses tomato and crema". */
  uses: string | null;
  /** "To buy onion"; null when everything is at home. */
  toBuy: string | null;
  /** "25 min". */
  minutes: string | null;
  why: string | null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : [];
}

/** The worker's answer, read defensively (it is a model's JSON): at most 3 ideas with a title. */
export function useItUpIdeaViews(result: unknown): UseItUpIdeaView[] {
  const ideas = (result as Partial<UseItUpIdeas> | null)?.ideas;
  if (!Array.isArray(ideas)) return [];
  return ideas
    .filter((i): i is UseItUpIdeas['ideas'][number] => typeof i?.title === 'string' && i.title.trim() !== '')
    .slice(0, MAX_IDEAS)
    .map((i, index) => {
      const uses = strings(i.uses);
      const toBuy = strings(i.to_buy);
      return {
        key: `${index}-${i.title}`,
        title: i.title.trim(),
        uses: uses.length > 0 ? `Uses ${listLine(uses)}` : null,
        toBuy: toBuy.length > 0 ? `To buy ${listLine(toBuy)}` : null,
        minutes: typeof i.minutes === 'number' ? formatMinutes(Math.round(i.minutes)) : null,
        why: typeof i.why === 'string' && i.why.trim() !== '' ? i.why.trim() : null,
      };
    });
}

/** A YouTube search for the dish: where most recipes worth saving are. */
export function ideaVideoUrl(title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} recipe`)}`;
}

/** The food a job asked about (a job opened by id: a notification, the working bar). */
function jobFood(job: AskJob | null): UseItUpFood | null {
  return job?.subject_id && job.input_text?.trim() ? { productId: job.subject_id, name: job.input_text.trim() } : null;
}

/**
 * The "Ideas for …" sheet behind every Use soon card. `open(food)` shows it and asks (an answer from the
 * last hour is reused), `openJob(id)` shows a question asked earlier; `sheet` is ready for UseItUpSheet.
 * `onRecipes` is today's way: Recipes filtered by it.
 */
export function useUseItUp(onRecipes: (food: UseItUpFood) => void) {
  const [chosen, setChosen] = useState<UseItUpFood | null>(null);
  const ask = useWorkerAsk('idea');
  const openUrl = useOpenUrl();
  const food = chosen ?? jobFood(ask.job);
  const askFor = (f: UseItUpFood, fresh: boolean) => ask.ask({ subjectId: f.productId, input: f.name, reuseDone: !fresh });

  const noun = food?.name.toLowerCase() ?? 'your food';
  const ideas = ask.phase === 'done' ? useItUpIdeaViews(ask.job?.result) : [];
  const { state, message, canRetry } = askOutcome(ask, ideas.length > 0, {
    notAsked: "Couldn't ask for ideas. Try again.",
    failed: "Couldn't come up with ideas right now.",
    empty: `No ideas for ${noun} this time.`,
  });
  // Left while Mesa thinks: the moment to offer telling them when it's ready.
  const { visible, show, leave } = useLeavable(state === 'working');

  return {
    /** The job on show (null until queued). */
    jobId: ask.jobId,
    open: (f: UseItUpFood) => {
      show();
      setChosen(f);
      // The same food again: its answer (or the wait for it) is still here.
      if (f.productId === food?.productId && (state === 'ready' || ask.phase === 'working')) return;
      ask.reset();
      askFor(f, false);
    },
    openJob: (jobId: string) => {
      show();
      if (jobId === ask.jobId) return;
      setChosen(null);
      ask.follow(jobId);
    },
    sheet: {
      visible,
      onClose: leave,
      food: noun,
      state,
      ideas,
      message,
      // An empty answer is asked anew; otherwise a job still working (or answered meanwhile) is picked up.
      // None when asking again can't work before tomorrow.
      onRetry: canRetry ? () => food && askFor(food, ask.phase === 'done') : undefined,
      onVideo: (key: string) => {
        const idea = ideas.find((i) => i.key === key);
        if (idea) openUrl(ideaVideoUrl(idea.title));
      },
      onRecipes: () => {
        leave();
        if (food) onRecipes(food);
      },
    },
  };
}
