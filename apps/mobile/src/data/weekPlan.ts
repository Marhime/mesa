// Plan my week: Mesa picks dinners among the household's own recipes (a 'plan' job, answered in
// import_jobs.result as a WeekPlan) and says why each one, and what it uses up. Every dinner comes ticked;
// the person unticks what doesn't suit them and adds the rest to On the menu, which fills the list.
// One sheet for the app (askSheets.tsx), opened from Home or from an Ask Mesa answer (its wishes filled
// in); closing it while Mesa plans leaves the job running (the working bar, then a toast or a push).
import type { WeekPlan } from '@mesa/shared';
import { useState } from 'react';

import { listLine } from '../lib/text';
import { askOutcome, useLeavable } from './askOutcome';
import { friendlyError } from './errors';
import type { Notify } from './notice';
import { usePlanWithUndo } from './planWithUndo';
import { useRecipes } from './recipes';
import { useUpNext } from './upNext';
import { useWorkerAsk } from './workerAsk';

/** Wishes offered as chips; anything else goes in the field. */
export const WEEK_WISHES = ['Quick on weekdays', "Use what's at home", 'Something new', 'Vegetarian'] as const;
/** What the job says when nothing in particular is wished. */
const ANY_WEEK = 'week';
const MAX_DINNERS = 7;
/** Below this, there is nothing to plan from. */
const MIN_RECIPES = 2;
const NONE: ReadonlySet<string> = new Set();

/** One dinner of the plan, ready to show. */
export interface PlanDinnerView {
  /** The recipe's id. */
  key: string;
  title: string;
  /** "Monday"; null when the order doesn't matter. */
  day: string | null;
  why: string | null;
  /** "Uses cream and avocado". */
  uses: string | null;
  /** Already On the menu (before, or added from this plan): nothing to tick. */
  onMenu: boolean;
}

export interface WeekPlanView {
  dinners: PlanDinnerView[];
  /** One line about the whole week. */
  note: string | null;
  /** What was asked ("Quick on weekdays, vegetarian"). */
  wishes: string | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * The worker's answer, read defensively (a model's JSON): dinners naming one of the household's recipes
 * (`known`, when the list is on the phone), each once, at most 7.
 */
export function weekPlanView(result: unknown, known: ReadonlySet<string> | null, onMenu: ReadonlySet<string>): WeekPlanView {
  const plan = result as Partial<WeekPlan> | null;
  const seen = new Set<string>();
  const dinners: PlanDinnerView[] = [];
  for (const d of Array.isArray(plan?.dinners) ? plan.dinners : []) {
    const id = text(d?.recipe_id);
    const title = text(d?.title);
    if (!id || !title || seen.has(id) || (known && !known.has(id))) continue;
    seen.add(id);
    const uses = (Array.isArray(d.uses_soon) ? d.uses_soon : []).map(text).filter((u): u is string => !!u);
    dinners.push({
      key: id,
      title,
      day: text(d.day),
      why: text(d.why),
      uses: uses.length > 0 ? `Uses ${listLine(uses)}` : null,
      onMenu: onMenu.has(id),
    });
  }
  return { dinners: dinners.slice(0, MAX_DINNERS), note: text(plan?.note), wishes: text(plan?.wishes) };
}

/** What the job asks: the wishes picked and typed, or 'week'. */
export function wishText(picked: ReadonlySet<string>, other: string): string {
  const parts = [...WEEK_WISHES.filter((w) => picked.has(w)), other.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : ANY_WEEK;
}

/** Wishes in words ("quick on weekdays, no fish") as the sheet shows them: the chips they name, the rest typed. */
export function wishesFrom(words: string | null): { picked: ReadonlySet<string>; other: string } {
  const picked = new Set<string>();
  const rest: string[] = [];
  for (const part of (words ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const chip = WEEK_WISHES.find((w) => w.toLowerCase() === part.toLowerCase());
    if (chip) picked.add(chip);
    else rest.push(part);
  }
  return { picked, other: rest.join(', ') };
}

/** Home's "Plan my week" shows once there are recipes to plan from. */
export function useCanPlanWeek(): boolean {
  const recipes = useRecipes();
  return (recipes.data?.length ?? 0) >= MIN_RECIPES;
}

/** Adds the picked dinners one after the other, like Plan it (one toast with Undo); stops at the first that fails and says which. */
function useAddDinners(notify: Notify) {
  const { planAll } = usePlanWithUndo(notify);
  const [added, setAdded] = useState<ReadonlySet<string>>(NONE);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (todo: PlanDinnerView[], onDone: () => void) => {
    if (todo.length === 0 || adding) return;
    setAdding(true);
    setError(null);
    const result = await planAll(
      todo.map((d) => ({ recipeId: d.key, title: d.title })),
      (recipeId) => setAdded((prev) => new Set([...prev, recipeId])),
    );
    setAdding(false);
    if (!result.failed) return onDone();
    const { title, error: why } = result.failed;
    const reason = friendlyError(why, 'Try again.');
    setError(result.added > 0 ? `Added ${result.added} of ${todo.length}. Couldn't add ${title}: ${reason}` : `Couldn't add ${title}. ${reason}`);
  };

  return {
    added,
    adding,
    error,
    add,
    clear: () => {
      setAdded(NONE);
      setError(null);
    },
  };
}

/**
 * The "Plan my week" sheet. `open()` shows it (a plan still working or not yet added stays; otherwise the
 * wishes); `open(wishes)` (Ask Mesa) starts from those wishes unless a plan is still working;
 * `openJob(id)` shows a plan asked earlier; `sheet` is ready for WeekPlanSheet.
 */
export function useWeekPlan({ notify }: { notify: Notify }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(NONE);
  const [other, setOther] = useState('');
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(NONE);
  // The plan went to the menu: the next open starts over.
  const [handled, setHandled] = useState(false);
  const ask = useWorkerAsk('plan');
  const recipes = useRecipes();
  const upNext = useUpNext();
  const adder = useAddDinners(notify);

  const known = recipes.data ? new Set(recipes.data.map((r) => r.id)) : null;
  const onMenu = new Set([...(upNext.data ?? []).map((e) => e.recipe_id), ...adder.added]);
  const view = ask.phase === 'done' ? weekPlanView(ask.job?.result, known, onMenu) : null;
  const dinners = view?.dinners ?? [];
  const todo = dinners.filter((d) => !d.onMenu && !skipped.has(d.key));
  const outcome = askOutcome(ask, dinners.length > 0, {
    notAsked: "Couldn't start planning. Try again.",
    failed: "Couldn't plan your week right now.",
    empty: 'No dinners to suggest from your recipes this time.',
  });
  // Nothing asked yet: the wishes come first.
  const state: 'ask' | 'working' | 'ready' | 'failed' = ask.phase === 'idle' ? 'ask' : outcome.state;
  const message = outcome.message;
  // Left while Mesa plans: the moment to offer telling them when it's ready.
  const { visible, show, hide, leave } = useLeavable(state === 'working');
  const askedText = view?.wishes ?? ask.job?.input_text ?? null;

  const restart = () => {
    ask.reset();
    adder.clear();
    setSkipped(NONE);
    setHandled(false);
  };
  const askFor = (input: string) => ask.ask({ input, reuseDone: false });

  return {
    /** The job on show (null until queued). */
    jobId: ask.jobId,
    open: (wishes?: string | null) => {
      show();
      if (ask.phase === 'working' || (wishes === undefined && state === 'ready' && !handled)) return;
      restart();
      if (wishes === undefined) return;
      const filled = wishesFrom(wishes);
      setPicked(filled.picked);
      setOther(filled.other);
    },
    openJob: (jobId: string) => {
      show();
      if (jobId === ask.jobId) return;
      restart();
      ask.follow(jobId);
    },
    sheet: {
      visible,
      onClose: leave,
      state,
      wishes: WEEK_WISHES.map((label) => ({ label, selected: picked.has(label) })),
      onWish: (label: string) =>
        setPicked((prev) => {
          const next = new Set(prev);
          if (next.has(label)) next.delete(label);
          else next.add(label);
          return next;
        }),
      other,
      onOther: setOther,
      onPlan: () => askFor(wishText(picked, other)),
      asked: askedText && askedText !== ANY_WEEK ? askedText : null,
      dinners: dinners.map((d) => ({ ...d, checked: !d.onMenu && !skipped.has(d.key) })),
      note: view?.note ?? null,
      onToggle: (key: string) =>
        setSkipped((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        }),
      count: todo.length,
      onAdd: () =>
        void adder.add(todo, () => {
          setHandled(true);
          hide();
        }),
      adding: adder.adding,
      error: adder.error,
      message,
      // A job still working is picked up; otherwise the same wishes are asked anew. None when asking again
      // can't work before tomorrow.
      onRetry: outcome.canRetry ? () => askFor(ask.job?.input_text ?? wishText(picked, other)) : undefined,
      onStartOver: restart,
    },
  };
}
