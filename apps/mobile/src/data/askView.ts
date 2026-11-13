// Ask Mesa's turns, ready to show: each question with its state, the answer (or its words so far), the
// recipes and buttons it offers, and the videos looked for under it. Pure.
import type { AskAction, AskActionKind } from './askAnswer';
import { isPending, type Turn } from './askConversation';
import type { AskFindView } from './askFinds';

/** One question and its answer, ready to show. */
export interface AskTurnView {
  key: string;
  question: string;
  state: 'working' | 'answered' | 'failed';
  /** While Mesa works: the answer's words so far; null before the first ones. */
  draft: string | null;
  answer: string | null;
  /** Why there is no answer (the worker's words, cancelled). */
  message: string | null;
  recipes: { key: string; title: string; why: string | null; imageUrl: string | null }[];
  actions: { key: string; kind: AskActionKind; label: string; done: boolean; busy: boolean }[];
  /** Only the last question can be asked again, and not when that can't work before tomorrow. */
  canRetry: boolean;
  /** The videos Mesa looks for under this answer; null when it doesn't. */
  find: AskFindView | null;
  /** Its search failed and looking again can work today. */
  canRetryFind: boolean;
}

/** What the turns are shown with. */
export interface AskViewContext {
  /** The search under a turn, ready to show; null when there is none. */
  find: (turnKey: string) => AskFindView | null;
  /** The waiting question's answer as it is written; null before the first words. */
  draft: string | null;
  /** The words of a question opened by its job, once its job is read. */
  jobQuestion: string | null;
  recipeImage: (recipeId: string) => string | null;
  /** An answer's button: done, under way, its words. */
  action: (id: string, action: AskAction) => { done: boolean; busy: boolean; label: string };
}

/** The last question asked (searches aside): the only one that can be asked again. */
export function lastQuestion(turns: Turn[]): Turn | undefined {
  return [...turns].reverse().find((t) => !t.search);
}

export function askTurnViews(turns: Turn[], ctx: AskViewContext): AskTurnView[] {
  const last = lastQuestion(turns);
  return turns.map((t) => {
    const find = ctx.find(t.key);
    const working = isPending(t);
    return {
      key: t.key,
      question: t.question ?? (t.search ? find?.query : ctx.jobQuestion) ?? '',
      state: working ? 'working' : t.failed !== null ? 'failed' : 'answered',
      draft: working ? ctx.draft : null,
      answer: t.answer?.text ?? null,
      message: t.failed,
      recipes: (t.answer?.recipes ?? []).map((r) => ({ key: r.key, title: r.title, why: r.why, imageUrl: ctx.recipeImage(r.recipeId) })),
      actions: (t.answer?.actions ?? []).map((a) => ({ key: a.key, kind: a.kind, ...ctx.action(`${t.key}:${a.key}`, a) })),
      canRetry: t === last && t.failed !== null && !!t.question && !t.untilTomorrow,
      find,
      canRetryFind: find?.canRetry ?? false,
    };
  });
}
