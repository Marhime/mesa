// Ask Mesa, the one assistant: a question in plain words ("what can I make in 20 min?", "find me a spicy
// chicken recipe", "no cream?" about a recipe) answered from the household's kitchen (an 'ask' job,
// answered with AskAnswer): recipes to open, things to do and, when it says `find`, real recipe videos it
// looks for at once under the answer (askFinds.ts). The answer shows as the worker writes it (askDraft.ts).
// A follow-up sends the earlier turns (input_context); a question about a recipe sends that recipe
// (subject_id). One conversation per kitchen, on its own screen (app/ask.tsx, opened through
// askSheets.tsx); this phone keeps it for a day (askMemory.ts). Leaving while Mesa works leaves the jobs
// running (the Mesa button, then a toast or a push). The turns live in askConversation.ts, their view in askView.ts.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { askAnswerView, askContext } from './askAnswer';
import { EMPTY_CONVERSATION, conversationReducer, isPending, type Outcome, type Turn } from './askConversation';
import { useAskDraft } from './askDraft';
import { useAskFinds } from './askFinds';
import { useAskActions, type AskActionsOptions } from './askMesaActions';
import { useKeptConversation, type KeptConversation } from './askMemory';
import { askMessage, canAskAgain, useLeavable } from './askOutcome';
import { askStarters } from './askStarters';
import { askTurnViews, lastQuestion } from './askView';
import { useFollowedCreators } from './creators';
import { useHouseholdId } from './household';
import { undoNotice } from './notice';
import { usePantry } from './pantry';
import { recipeImageUrl, useRecipes } from './recipes';
import { useUpNext } from './upNext';
import { useWorkerAsk } from './workerAsk';

const MAX_QUESTION = 300;
const NOT_ANSWERED = "Mesa couldn't answer that right now.";

export function useAskMesa({ notify, onOpenRecipe, onPlanWeek }: AskActionsOptions) {
  const [{ turns, about }, dispatch] = useReducer(conversationReducer, EMPTY_CONVERSATION);
  const [draft, setDraft] = useState('');
  const ask = useWorkerAsk('ask');
  const { follow: followAsk, reset: resetAsk } = ask;
  const written = useAskDraft(ask.job?.status === 'processing' ? ask.jobId : null);
  const finds = useAskFinds({ onError: (message) => notify(message, { tone: 'error' }) });
  const { start: startFind, follow: followFind, reset: resetFinds, jobIds: findJobIds } = finds;
  const actions = useAskActions({ notify, onOpenRecipe, onPlanWeek });
  const { restore: restoreDone, reset: resetDone, doneIds } = actions;
  const recipes = useRecipes();
  const pantry = usePantry();
  const upNext = useUpNext();
  const following = useFollowedCreators();
  const householdId = useHouseholdId();
  const keys = useRef(0);
  const askedAt = useRef(0);
  // A question opened by its job (a push about Tinga): once it loads, its recipe is the subject again.
  const adopt = useRef<string | null>(null);
  const nextKey = () => String(++keys.current);
  const pending = turns.some(isPending);
  const turnsNow = useRef(turns);
  turnsNow.current = turns;

  // On screen (the Ask screen says when it is focused); leaving while Mesa works offers notifications.
  const screen = useLeavable(pending || finds.working);
  const { show, leave } = screen;
  const setShown = useCallback((now: boolean) => (now ? show() : leave()), [show, leave]);

  // The job finished (answered, failed, cancelled): its turn keeps the outcome.
  const byId = useMemo(() => new Map((recipes.data ?? []).map((r) => [r.id, r])), [recipes.data]);
  const known = useMemo(() => (id: string) => byId.has(id), [byId]);
  const finished = ask.phase === 'done' || ask.phase === 'failed' || ask.phase === 'cancelled';
  const outcome = useMemo((): Outcome | null => {
    if (!finished) return null;
    const answer = ask.phase === 'done' ? askAnswerView(ask.job?.result, known) : null;
    const failed = answer ? null : askMessage(ask, false, { notAsked: "Couldn't ask Mesa. Try again.", failed: NOT_ANSWERED, empty: NOT_ANSWERED });
    const untilTomorrow = failed !== null && !canAskAgain(ask);
    return { jobId: ask.jobId, question: ask.job?.input_text?.trim() || null, answer, failed, untilTomorrow, about: ask.job?.subject_id ?? null };
  }, [finished, ask, known]);
  useEffect(() => {
    if (!outcome) return;
    const adopted = !!outcome.jobId && outcome.jobId === adopt.current;
    if (adopted) adopt.current = null;
    dispatch({ type: 'settle', outcome, adopt: adopted });
  }, [outcome]);

  // An answer that looks for videos: the search starts at once, under it (once per answer).
  useEffect(() => {
    for (const t of turns) if (t.answer?.find) startFind(t.key, t.answer.find.query);
  }, [turns, startFind]);

  // What this phone keeps of it, rebuilt only when it changes.
  const kept = useMemo(
    (): KeptConversation => ({
      householdId: householdId ?? '',
      at: askedAt.current,
      about,
      turns: turns.map((t) => ({ ...t, jobId: isPending(t) ? (t.jobId ?? ask.jobId) : t.jobId, findJobId: findJobIds.get(t.key) ?? null })),
      done: doneIds,
    }),
    [householdId, about, turns, ask.jobId, findJobIds, doneIds],
  );
  /** A kept conversation comes back as it was: its questions, what was done, its searches, a question on its way. */
  const restore = useCallback(
    (c: KeptConversation) => {
      keys.current = Math.max(keys.current, 0, ...c.turns.map((t) => Number(t.key) || 0));
      askedAt.current = c.at;
      const restored: Turn[] = c.turns.map(({ findJobId: _, ...t }) =>
        // A question that never reached Mesa can only be asked again.
        isPending(t) && !t.jobId ? { ...t, failed: "This question wasn't sent. Try again." } : t,
      );
      dispatch({ type: 'restore', conversation: { turns: restored, about: c.about } });
      restoreDone(c.done);
      for (const t of c.turns) if (t.findJobId) followFind(t.key, t.findJobId);
      const waiting = c.turns.find((t) => isPending(t) && t.jobId);
      if (waiting?.jobId) followAsk(waiting.jobId);
    },
    [restoreDone, followFind, followAsk],
  );
  // The kitchen's kept conversation comes back, unless a question came first.
  useKeptConversation(householdId, householdId ? kept : null, (c) => {
    if (turnsNow.current.length === 0) restore(c);
  });

  const askQuestion = (question: string, subject: string | null, earlier: Turn[]) =>
    ask.ask({ input: question, ...(subject ? { subjectId: subject } : {}), context: askContext(earlier), reuseDone: false });
  const addTurn = (turn: Omit<Turn, 'key'>) => {
    const key = nextKey();
    dispatch({ type: 'add', turn: { key, ...turn } });
    return key;
  };
  const send = (words: string) => {
    const question = words.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
    if (question === '' || pending) return;
    askedAt.current = Date.now();
    addTurn({ question, about, jobId: null, answer: null, failed: null, search: false });
    setDraft('');
    askQuestion(question, about, turns);
  };
  const clear = () => {
    dispatch({ type: 'clear' });
    resetDone();
    resetAsk();
    resetFinds();
  };
  // "New": Undo brings the conversation back, unless another one has started meanwhile.
  const startOver = () => {
    const before = kept;
    clear();
    notify(
      'Started over',
      undoNotice(() => {
        if (turnsNow.current.length === 0) restore(before);
      }),
    );
  };

  const views = askTurnViews(turns, {
    find: finds.view,
    draft: written,
    jobQuestion: ask.job?.input_text?.trim() ?? null,
    recipeImage: (id) => recipeImageUrl(byId.get(id)?.image_path ?? null),
    action: actions.status,
  });
  const aboutTitle = about ? (byId.get(about)?.title ?? 'this recipe') : null;
  const starters = useMemo(
    () =>
      askStarters({
        about: aboutTitle,
        useSoon: pantry.useSoon.map((f) => f.name),
        onMenu: (upNext.data ?? []).flatMap((e) => (e.recipe ? [e.recipe.title] : [])),
        recipes: recipes.data?.length ?? 0,
        following: (following.data ?? []).map((c) => c.name),
      }),
    [aboutTitle, pantry.useSoon, upNext.data, recipes.data, following.data],
  );
  const holds = (jobId: string) => jobId === ask.jobId || turns.some((t) => t.jobId === jobId) || finds.holds(jobId);

  return {
    shown: screen.visible,
    /** True when this job is the conversation's (a question or one of its searches). */
    holds,
    /** "Ask Mesa…": the conversation so far (about the whole kitchen if nothing was asked yet). */
    open: () => {
      if (turns.length === 0) dispatch({ type: 'about', about: null });
    },
    /** "Ask about this recipe": a new conversation about it, unless Mesa is still answering the last one. */
    openAbout: (recipeId: string) => {
      if (recipeId === about) return;
      if (turns.length > 0 && !pending) clear();
      dispatch({ type: 'about', about: recipeId });
    },
    /** A question asked earlier (the Mesa button, a toast, a push). */
    openJob: (jobId: string) => {
      // Already here, or another question is on its way: the conversation stays as it is.
      if (holds(jobId) || pending) return;
      adopt.current = jobId;
      askedAt.current = Date.now();
      addTurn({ question: null, about: null, jobId, answer: null, failed: null, search: false });
      followAsk(jobId);
    },
    /** A search asked earlier: shown in the conversation, under its words. */
    openFindJob: (jobId: string) => {
      if (finds.holds(jobId)) return;
      askedAt.current = Date.now();
      followFind(addTurn({ question: null, about: null, jobId: null, answer: null, failed: null, search: true }), jobId);
    },
    /** The Ask screen came up or went away (never changes: the screen's focus effect depends on it). */
    setShown,
    screen: {
      /** The recipe's name ("Tinga") while questions are about it. */
      about: aboutTitle,
      onClearAbout: () => dispatch({ type: 'about', about: null }),
      turns: views,
      starters: turns.length > 0 ? [] : starters,
      onStarter: send,
      draft,
      onChangeDraft: setDraft,
      canSend: !pending && draft.trim() !== '',
      onSend: () => send(draft),
      maxLength: MAX_QUESTION,
      onRetry: () => {
        const t = lastQuestion(turns);
        if (!t?.question || t.failed === null) return;
        dispatch({ type: 'retry', key: t.key });
        askQuestion(t.question, t.about, turns.slice(0, turns.indexOf(t)));
      },
      onRecipe: (recipeKey: string) => {
        const recipeId = turns.flatMap((t) => t.answer?.recipes ?? []).find((r) => r.key === recipeKey)?.recipeId ?? recipeKey;
        onOpenRecipe(recipeId);
      },
      onAction: (turnKey: string, actionKey: string) => {
        const action = turns.find((t) => t.key === turnKey)?.answer?.actions.find((a) => a.key === actionKey);
        if (action) actions.run(`${turnKey}:${actionKey}`, action);
      },
      onSaveVideo: finds.save,
      onWatchVideo: finds.watch,
      onRetryFind: finds.retry,
      /** A new conversation (Undo brings this one back); null while Mesa thinks or before the first question. */
      onStartOver: turns.length > 0 && !pending ? startOver : null,
    },
  };
}
