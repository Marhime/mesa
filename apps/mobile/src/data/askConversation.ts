// Ask Mesa's conversation as data: its turns (a question and its outcome, or a search shown on its own) and
// what the next question is about. A reducer, so every change is one named step. Pure.
import type { AskAnswerView } from './askAnswer';

/** One question and its outcome, or a search opened by its job (`search`). */
export interface Turn {
  key: string;
  /** Null for a question opened by its job until it loads. */
  question: string | null;
  /** The recipe it is about; null: the whole kitchen. */
  about: string | null;
  jobId: string | null;
  answer: AskAnswerView | null;
  /** Why there is no answer (the worker's words, cancelled). */
  failed: string | null;
  /** Failed in a way asking again can't fix before tomorrow (Mesa's daily limit): no Try again. Absent in turns kept before. */
  untilTomorrow?: boolean;
  search: boolean;
}

/** How the job of the question waiting for its answer ended. */
export type Outcome = Pick<Turn, 'jobId' | 'question' | 'answer' | 'failed' | 'untilTomorrow' | 'about'>;

export interface Conversation {
  turns: Turn[];
  /** What the next question is about ("Ask about this recipe"); null: the whole kitchen. */
  about: string | null;
}

export const EMPTY_CONVERSATION: Conversation = { turns: [], about: null };

/** A question still waiting for its answer. */
export const isPending = (t: Turn | undefined): boolean => !!t && !t.search && !t.answer && t.failed === null;

/** The question waiting for its answer, settled with its job's outcome; unchanged when that job already answered another turn. */
export function settle(list: Turn[], outcome: Outcome): Turn[] {
  const at = list.findIndex(isPending);
  if (at < 0) return list;
  if (outcome.jobId && list.some((t, i) => i !== at && t.jobId === outcome.jobId)) return list;
  const { jobId, answer, failed, untilTomorrow } = outcome;
  return list.map((t, i) =>
    i === at ? { ...t, jobId, answer, failed, untilTomorrow, question: t.question ?? outcome.question, about: t.about ?? outcome.about } : t,
  );
}

export type ConversationStep =
  /** A question, or a job / search opened from outside. */
  | { type: 'add'; turn: Turn }
  /** The waiting question's job ended; `adopt`: it was opened by its job, so its recipe is the subject again. */
  | { type: 'settle'; outcome: Outcome; adopt: boolean }
  /** The last question, asked again. */
  | { type: 'retry'; key: string }
  | { type: 'about'; about: string | null }
  /** A kept conversation comes back (this phone's, or Undo of "New"). */
  | { type: 'restore'; conversation: Conversation }
  /** "New". */
  | { type: 'clear' };

export function conversationReducer(state: Conversation, step: ConversationStep): Conversation {
  switch (step.type) {
    case 'add':
      return { ...state, turns: [...state.turns, step.turn] };
    case 'settle': {
      const turns = settle(state.turns, step.outcome);
      const about = step.adopt && step.outcome.about ? step.outcome.about : state.about;
      return turns === state.turns && about === state.about ? state : { turns, about };
    }
    case 'retry':
      return { ...state, turns: state.turns.map((t) => (t.key === step.key ? { ...t, jobId: null, failed: null } : t)) };
    case 'about':
      return { ...state, about: step.about };
    case 'restore':
      return step.conversation;
    case 'clear':
      return EMPTY_CONVERSATION;
  }
}
