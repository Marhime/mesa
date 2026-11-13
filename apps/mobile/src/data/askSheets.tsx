// One of each sheet (sheetRegistry.ts) and Ask Mesa for the whole app. Screens open them with what they know
// (a recipe's "More from …" or "Ask about this recipe", Your creators, a shared channel link, a Use soon card,
// Plan my week, the Mesa button); the Mesa button, toasts and notifications open them by job (askKinds.ts says
// where each kind opens). Closing one leaves its job running. Ask Mesa is a screen (app/ask.tsx) that comes
// up over the app: its conversation lives here, so it outlives the screen.
//
// Their state lives in a host remounted for each kitchen: signing out or joining another kitchen starts
// afresh (no conversation, no sheet from the other one), while the screens below stay as they are. The host
// hands its latest state to a small store the hooks below read.
//
// The sheets are drawn by an outlet (`useAskSheetsOutlet`): the root layout's, or a modal screen's while
// it is up (a sheet can't come up over a modal screen from the app root; like ToastOutlet).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';

import { askKind, type AskKind } from './askKinds';
import { useAskMesa } from './askMesa';
import type { CreatorTarget } from './creatorVideos';
import { useHouseholdId } from './household';
import type { Notify } from './notice';
import { SHEET_NAMES, sheetsView, useHostedSheets, type HostedSheets, type SheetInput, type SheetName, type SheetsView } from './sheetRegistry';
import type { UseItUpFood } from './useItUp';

export interface AskSheetsApi {
  /** A sheet by name, on what it shows (a creator, a food, wishes for the week). */
  open: <N extends SheetName>(name: N, input: SheetInput<N>) => void;
  /** Something asked earlier (the Mesa button, a toast, a push): its sheet, or Ask Mesa. A recipe's news is not a sheet's. */
  openJob: (kind: AskKind, jobId: string) => void;
  /** A creator's latest recipe videos. `onClose` runs once when the sheet closes (a shared link's screen leaves). */
  openCreator: (target: CreatorTarget, options?: { onClose?: () => void }) => void;
  /** "Ideas for tomato". */
  openIdeas: (food: UseItUpFood) => void;
  /** "Plan my week". */
  openWeekPlan: () => void;
  /** "Ask Mesa…": the conversation so far. */
  openAsk: () => void;
  /** "Ask about this recipe": Ask Mesa, about that recipe. */
  openAskAbout: (recipeId: string) => void;
  /** True while that job's sheet (or Ask Mesa holding it) is on screen: its news needs no toast. */
  isShowing: (jobId: string) => boolean;
}

/** Props for CreatorSheet, UseItUpSheet and WeekPlanSheet. */
export type AskSheetsView = SheetsView;

type AskMesa = ReturnType<typeof useAskMesa>;
/** The Ask screen's props, and how it says it is on screen. */
export type AskMesaScreenView = AskMesa['screen'] & { setShown: (shown: boolean) => void };

export interface AskSheetsProviderProps {
  children: ReactNode;
  /** Says what started or got done (a toast): "Importing 3 recipes from Food is Love", "4 dinners on the menu · list updated". */
  notify: Notify;
  /** A recipe's screen (Ask Mesa's recipes and "Open"). */
  onOpenRecipe: (recipeId: string) => void;
  /** Brings the Ask screen up over the app (nothing when it is already there). */
  onShowAsk: () => void;
  /** "Your recipes with tomato": Recipes filtered by that food. */
  onFoodRecipes: (food: UseItUpFood) => void;
  /** How long a sheet takes to leave: the other one comes up after it (one sheet at a time). */
  sheetExitMs: number;
}

// The host's latest state, for the hooks -------------------------------------------------------------

interface HostSnapshot {
  api: AskSheetsApi;
  sheets: AskSheetsView;
  askScreen: AskMesaScreenView;
}

interface HostStore {
  get: () => HostSnapshot | null;
  set: (next: HostSnapshot | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function createHostStore(): HostStore {
  let snapshot: HostSnapshot | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set: (next) => {
      snapshot = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const noop = () => undefined;
const NO_API: AskSheetsApi = {
  open: noop,
  openJob: noop,
  openCreator: noop,
  openIdeas: noop,
  openWeekPlan: noop,
  openAsk: noop,
  openAskAbout: noop,
  isShowing: () => false,
};
const NO_STORE: HostStore = { get: () => null, set: noop, subscribe: () => noop };

interface Outlet {
  id: number;
  /** The app root's: used only while no screen has its own. */
  root: boolean;
}

interface Outlets {
  active: number | null;
  register: (outlet: Outlet) => void;
  unregister: (id: number) => void;
}

const StoreContext = createContext<HostStore>(NO_STORE);
const OutletContext = createContext<Outlets>({ active: null, register: noop, unregister: noop });

/** Reads one part of the host's state; re-renders only when that part changes. */
function useHost<T>(pick: (s: HostSnapshot | null) => T): T {
  const store = useContext(StoreContext);
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}

// The host ---------------------------------------------------------------------------------------------

interface HostState {
  sheets: HostedSheets;
  ask: AskMesa;
  sheetExitMs: number;
  onShowAsk: () => void;
}

/** The API reads the host's latest state through a ref: it never changes, so screens don't re-render as jobs poll. */
function hostApi(latest: RefObject<HostState>): AskSheetsApi {
  // One sheet at a time: any other one up slides away first.
  const handOff = (self: SheetName | 'ask', show: () => void) => {
    const others = SHEET_NAMES.filter((n) => n !== self && latest.current.sheets[n].sheet.visible);
    if (others.length === 0) return show();
    for (const n of others) latest.current.sheets[n].sheet.onClose();
    setTimeout(show, latest.current.sheetExitMs);
  };
  const open = <N extends SheetName>(name: N, input: SheetInput<N>) =>
    handOff(name, () => (latest.current.sheets[name].open as (i: SheetInput<N>) => void)(input));
  // Ask Mesa: any sheet up slides away, then the screen comes up with the conversation ready.
  const showAsk = (prepare: (a: AskMesa) => void) =>
    handOff('ask', () => {
      prepare(latest.current.ask);
      latest.current.onShowAsk();
    });
  return {
    open,
    openJob: (kind, jobId) => {
      const opens = askKind(kind).opens;
      if ('sheet' in opens) handOff(opens.sheet, () => latest.current.sheets[opens.sheet].openJob(jobId));
      else if ('ask' in opens) showAsk((a) => (opens.ask === 'search' ? a.openFindJob(jobId) : a.openJob(jobId)));
    },
    openCreator: (target, options) => open('creator', { target, onClose: options?.onClose }),
    openIdeas: (food) => open('ideas', food),
    openWeekPlan: () => open('weekPlan', undefined),
    openAsk: () => showAsk((a) => a.open()),
    openAskAbout: (recipeId) => showAsk((a) => a.openAbout(recipeId)),
    isShowing: (jobId) => {
      const { ask, sheets } = latest.current;
      return (ask.shown && ask.holds(jobId)) || SHEET_NAMES.some((n) => sheets[n].sheet.visible && sheets[n].jobId === jobId);
    },
  };
}

/** Holds the sheets and the conversation of one kitchen, and hands them to the store as they change. */
function SheetsHost({ store, notify, onOpenRecipe, onShowAsk, onFoodRecipes, sheetExitMs }: Omit<AskSheetsProviderProps, 'children'> & { store: HostStore }) {
  const sheets = useHostedSheets({ notify, onFoodRecipes });
  // An answer's "Plan my week" comes up over the conversation, which stays below it, with the answer's wishes.
  const planWeek = useRef<(wishes: string | null) => void>(noop);
  const ask = useAskMesa({ notify, onOpenRecipe, onPlanWeek: (wishes) => planWeek.current(wishes) });
  const latest = useRef<HostState>({ sheets, ask, sheetExitMs, onShowAsk });
  latest.current = { sheets, ask, sheetExitMs, onShowAsk };
  const api = useMemo(() => hostApi(latest), []);
  planWeek.current = (wishes) => api.open('weekPlan', wishes);

  const snapshot: HostSnapshot = { api, sheets: sheetsView(sheets), askScreen: { ...ask.screen, setShown: ask.setShown } };
  useLayoutEffect(() => store.set(snapshot));
  useLayoutEffect(() => () => store.set(null), [store]);
  return null;
}

export function AskSheetsProvider({ children, ...host }: AskSheetsProviderProps) {
  const householdId = useHouseholdId();
  const [store] = useState(createHostStore);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const register = useCallback((o: Outlet) => setOutlets((list) => [...list, o]), []);
  const unregister = useCallback((id: number) => setOutlets((list) => list.filter((o) => o.id !== id)), []);
  const screens = outlets.filter((o) => !o.root);
  const active = (screens[screens.length - 1] ?? outlets.find((o) => o.root))?.id ?? null;
  const outlet = useMemo(() => ({ active, register, unregister }), [active, register, unregister]);

  return (
    <StoreContext.Provider value={store}>
      <OutletContext.Provider value={outlet}>
        {/* One host per kitchen. */}
        <SheetsHost key={householdId ?? 'none'} store={store} {...host} />
        {children}
      </OutletContext.Provider>
    </StoreContext.Provider>
  );
}

// For screens ------------------------------------------------------------------------------------------

/** The Ask screen's conversation (app/ask.tsx). Null outside the provider. */
export function useAskMesaScreen(): AskMesaScreenView | null {
  return useHost((s) => s?.askScreen ?? null);
}

/** Opens the app's sheets (creator, ideas, week plan) and Ask Mesa from any screen. Changes only with the kitchen. */
export function useAskSheets(): AskSheetsApi {
  return useHost((s) => s?.api ?? NO_API);
}

let outletIds = 0;

/**
 * Where the sheets are drawn: the props for each sheet while this outlet is the one in use, else null. The
 * root layout has the `root` one; a modal screen that opens a sheet has its own, which wins while it is
 * mounted (the latest one if several).
 */
export function useAskSheetsOutlet(placement: 'root' | 'screen' = 'screen'): AskSheetsView | null {
  const { active, register, unregister } = useContext(OutletContext);
  const sheets = useHost((s) => s?.sheets ?? null);
  const [id] = useState(() => ++outletIds);
  const root = placement === 'root';
  useEffect(() => {
    register({ id, root });
    return () => unregister(id);
  }, [id, root, register, unregister]);
  return active === id ? sheets : null;
}
