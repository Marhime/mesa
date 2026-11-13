// What finished while you were elsewhere in the app, and the Mesa button: a recipe ready or failed, a scan to
// review, an answer to something you asked (askKinds.ts says what each kind says and where it opens).
// A haptic always; a toast with a way in unless the screen already shows it. Notification taps too. The
// app shell says where it is and how to get places (NewsHost): no routes here.
import { useEffect, useRef } from 'react';

import { askKind } from './askKinds';
import { useAskedEvents, useAskedWork, useCancelAsk, type AskedJobView } from './askedJobs';
import { useAskSheets } from './askSheets';
import { markImportSeen, useImportEvents } from './importPanel';
import { notifyError, type Notify } from './notice';
import { useNotificationTaps, type AskedTarget } from './notifications';
import { setMutationErrorNotifier } from './queryClient';
import { proposalTitle, useScanReadyEvents } from './scans';

/** Opens a recipe's screen; `translated`: in the phone's language from the start. */
export type OpenRecipe = (recipeId: string, options?: { translated?: boolean }) => void;

/** What is on screen now, as far as news goes. */
export interface NewsScreen {
  /** The share screen: it says everything about its import itself. */
  importScreen: boolean;
  /** A screen that lists your imports (Home, Recipes): no toast needed for them. */
  importsList: boolean;
  /** Pantry: it shows scans to review. */
  pantry: boolean;
  /** The recipe on screen, if any. */
  recipeId: string | null;
}

export interface NewsHost {
  screen: NewsScreen;
  notify: Notify;
  /** The news landed (with or without a toast; an error toast has its own). */
  buzz: (kind: 'success' | 'warning') => void;
  openRecipe: OpenRecipe;
  openReview: (proposalId: string) => void;
  /** Recipes, where your imports are listed (and say why one failed). */
  openImports: () => void;
  /** Pantry, where scans are. */
  openScans: () => void;
}

const targetOf = (job: Pick<AskedJobView, 'id' | 'kind' | 'recipeId'>): AskedTarget => ({ kind: job.kind, jobId: job.id, recipeId: job.recipeId });

/** Where something asked and left to Mesa opens: its sheet, Ask Mesa (that question, that search), or its recipe. */
export function useOpenAsked(openRecipe: OpenRecipe): (job: AskedTarget) => void {
  const sheets = useAskSheets();
  return (job) => {
    const opens = askKind(job.kind).opens;
    if (!('recipe' in opens)) return sheets.openJob(job.kind, job.jobId);
    // A recipe's news whose push doesn't say which recipe (a failed translation): the app just opens.
    if (job.recipeId) openRecipe(job.recipeId, { translated: opens.recipe.translated });
  };
}

export function useBackgroundNews(host: NewsHost): void {
  const { screen, notify, buzz } = host;
  const sheets = useAskSheets();
  const openAsked = useOpenAsked(host.openRecipe);

  // Writes that fail without their own message say so here (a setting, an edit, a staple).
  const say = useRef(notify);
  say.current = notify;
  useEffect(() => {
    setMutationErrorNotifier((message) => say.current(message, { tone: 'error' }));
    return () => setMutationErrorNotifier(null);
  }, []);

  useImportEvents({
    ready: (e) => {
      if (screen.importScreen) return;
      buzz('success');
      if (screen.importsList) return;
      notify(e.proposalId ? 'That was a receipt: review it in Pantry' : e.alreadySaved ? `${e.title} was already in Recipes` : `${e.title} is in Recipes`, {
        action: {
          label: e.proposalId ? 'Review' : 'Open',
          onPress: () => {
            markImportSeen(e.id);
            if (e.proposalId) host.openReview(e.proposalId);
            else if (e.recipeId) host.openRecipe(e.recipeId);
          },
        },
      });
    },
    failed: (e) => {
      if (screen.importScreen) return;
      if (screen.importsList) return buzz('warning');
      notify(`Couldn't save ${e.title}`, { tone: 'error', action: { label: 'See why', onPress: host.openImports } });
    },
  });

  // Already on screen: its sheet is open, or the recipe it is about (a translation says it itself; a kind that
  // lands in place, like ingredients read again, gets only a word: nothing to open).
  const onScreen = (job: AskedJobView) => (job.recipeId ? screen.recipeId === job.recipeId : sheets.isShowing(job.id));
  const inPlace = (job: AskedJobView) => !!askKind(job.kind).inPlace && onScreen(job);
  useAskedEvents({
    ready: (job) => {
      if (onScreen(job) && !inPlace(job)) return;
      buzz('success');
      notify(job.ready, inPlace(job) ? undefined : { action: { label: 'Open', onPress: () => openAsked(targetOf(job)) } });
    },
    failed: (job) => {
      if (onScreen(job) && !inPlace(job)) return;
      // A sheet says why and offers Try again; a recipe left as it was has nothing more to show.
      notify(job.failed, { tone: 'error', action: job.recipeId ? undefined : { label: 'See why', onPress: () => openAsked(targetOf(job)) } });
    },
  });

  useScanReadyEvents((p) => {
    buzz('success');
    if (screen.pantry) return;
    notify(proposalTitle(p).title, { action: { label: 'Review', onPress: () => host.openReview(p.id) } });
  });

  useNotificationTaps((target) => {
    switch (target.to) {
      case 'asked':
        return openAsked(target.job);
      case 'recipe':
        return host.openRecipe(target.recipeId);
      case 'review':
        return host.openReview(target.proposalId);
      case 'imports':
        return host.openImports();
      case 'scans':
        return host.openScans();
    }
  });
}

/** The Mesa button's work: the latest job you left to Mesa (a tap opens it, Stop cancels it: "Cancelled"), or null. */
export function useMesaWork({ notify, openRecipe }: Pick<NewsHost, 'notify' | 'openRecipe'>) {
  const work = useAskedWork();
  const openAsked = useOpenAsked(openRecipe);
  const { mutate: cancel } = useCancelAsk();
  if (!work) return null;
  const { latest } = work;
  return {
    title: latest.working,
    more: work.more,
    onOpen: () => openAsked(targetOf(latest)),
    onCancel: () =>
      cancel(latest.id, {
        onSuccess: () => notify('Cancelled'),
        onError: (e) => notifyError(notify, e, "Couldn't cancel it. Try again."),
      }),
  };
}
