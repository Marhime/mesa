// Everything a screen needs to show your imports: progress while they work, a "ready" card when they
// land (until opened or dismissed), and the right way out when they fail.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { platformOfUrl } from '../lib/text';
import { importProgress, screenshotCount, type ImportProgressView } from './importProgress';
import { importRecovery, type RecoveryAction, type RecoveryKind } from './importRecovery';
import { useCreateImport, useImportJobs, useRemoveImport, useRetryImport, type ImportView } from './imports';
import { isWorking } from './jobs';
import { pickImages, readClipboardText } from './media';
import { notifyError, type Notify } from './notice';
import { recipeImageUrl } from './recipes';

export interface ImportItemView {
  id: string;
  state: 'working' | 'ready' | 'failed';
  /** The dish when known ("Tinga de pollo"), else what was shared ("Instagram post"). */
  title: string;
  /** "Instagram · 2 min ago", "New in Recipes", or why it failed. */
  caption: string;
  thumbnailUri: string | null;
  progress: ImportProgressView | null;
  recipeId: string | null;
  /** A shared photo that turned out to be a receipt: its pantry proposal. */
  proposalId: string | null;
  recovery: RecoveryAction[];
}

/** "Instagram post", "TikTok video", "bonappetit.com", "Your screenshot", "3 screenshots", "Shared text". */
export function importSource(job: Pick<ImportView, 'input_url' | 'input_image_path' | 'input_image_paths'>): string {
  const shots = screenshotCount(job);
  if (shots > 1) return `${shots} screenshots`;
  if (shots === 1) return 'Your screenshot';
  if (!job.input_url) return 'Shared text';
  const platform = platformOfUrl(job.input_url) ?? 'Link';
  if (platform === 'Instagram') return 'Instagram post';
  if (platform === 'TikTok' || platform === 'YouTube') return `${platform} video`;
  return platform;
}

function ago(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

export function importItemView(job: ImportView, now: number = Date.now()): ImportItemView {
  const source = importSource(job);
  const base = {
    id: job.id,
    recipeId: job.recipe_id,
    proposalId: job.proposal_id,
    progress: importProgress(job, now),
    recovery: [] as RecoveryAction[],
  };
  if (job.status === 'done') {
    const receipt = !!job.proposal_id;
    return {
      ...base,
      state: 'ready',
      title: receipt ? 'That was a receipt' : (job.recipe?.title ?? job.preview_title ?? source),
      caption: receipt ? 'Review it in Pantry' : job.already_saved ? 'Already in Recipes' : 'New in Recipes',
      thumbnailUri: recipeImageUrl(job.recipe?.image_path ?? null) ?? job.preview_image_url,
    };
  }
  const title = job.preview_title ?? source;
  if (job.status === 'failed') {
    return { ...base, state: 'failed', title, caption: job.error ?? 'Try again.', thumbnailUri: job.preview_image_url, recovery: importRecovery(job) };
  }
  return { ...base, state: 'working', title, caption: `${source} · ${ago(job.created_at, now)}`, thumbnailUri: job.preview_image_url };
}

// Ready cards you opened or dismissed, remembered on this phone. -----------------------------------

const SEEN_KEY = 'mesa.imports.seen';
const MAX_SEEN = 60;
let seenIds: string[] | null = null;
const seenListeners = new Set<() => void>();

async function loadSeen(): Promise<string[]> {
  if (seenIds) return seenIds;
  try {
    seenIds = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]') as string[];
  } catch {
    seenIds = [];
  }
  return seenIds;
}

export function markImportSeen(id: string): void {
  void loadSeen().then((ids) => {
    if (ids.includes(id)) return;
    seenIds = [...ids, id].slice(-MAX_SEEN);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seenIds)).catch(() => undefined);
    seenListeners.forEach((l) => l());
  });
}

function useSeenImports(): ReadonlySet<string> | null {
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(seenIds ? new Set(seenIds) : null);
  useEffect(() => {
    const read = () => void loadSeen().then((ids) => setSeen(new Set(ids)));
    read();
    seenListeners.add(read);
    return () => {
      seenListeners.delete(read);
    };
  }, []);
  return seen;
}

// Ways out -------------------------------------------------------------------------------------

/** Runs a recovery action. `notify` says what happened (a toast); new imports replace the failed one. */
export function useImportRecovery(notify: Notify, onReplaced?: (job: ImportView) => void) {
  const retry = useRetryImport();
  const remove = useRemoveImport();
  const create = useCreateImport();
  const fail = (e: unknown) => notifyError(notify, e, "Couldn't do that. Try again.");
  const replaceWith = (job: Pick<ImportView, 'id'>, input: Parameters<typeof create.mutate>[0]) =>
    create.mutate(input, {
      onSuccess: (created) => {
        remove.mutate(job.id);
        if (onReplaced) onReplaced(created);
        else notify('Mesa is on it.');
      },
      onError: fail,
    });

  const run = (job: ImportView, kind: RecoveryKind) => {
    switch (kind) {
      case 'retry':
        return retry.mutate(job.id, { onError: fail });
      case 'remove':
        return remove.mutate(job.id, { onError: fail });
      case 'openPost':
        if (job.input_url) Linking.openURL(job.input_url).catch(() => notify("Couldn't open the post.", { tone: 'error' }));
        return;
      case 'screenshot':
        return void pickImages()
          .then((images) => images.length > 0 && replaceWith(job, { images }))
          .catch((e: unknown) => notifyError(notify, e, "Couldn't open your photos."));
      case 'paste':
        return void readClipboardText().then((text) =>
          text && text.trim().length >= 20
            ? replaceWith(job, job.input_url ? { url: job.input_url, text } : { text })
            : notify('Copy the recipe text first, then tap Paste the text.'),
        );
    }
  };
  return { run, retryingId: retry.isPending ? retry.variables : undefined, replacing: create.isPending };
}

// The panel ------------------------------------------------------------------------------------

/** A row of the imports list, ready to render (ImportRow props). */
export interface ImportRowView {
  key: string;
  state: ImportItemView['state'];
  title: string;
  caption: string;
  thumbnailUri: string | null;
  progress: ImportProgressView | null;
  actions: { key: string; label: string; onPress: () => void; loading?: boolean }[];
  onOpen?: () => void;
  openLabel?: string;
  onDismiss?: () => void;
}

export interface ImportsPanelOptions {
  /** Says what happened (a toast; failures with the error tone). */
  notify: Notify;
  openRecipe: (recipeId: string) => void;
  /** A shared photo that was a receipt: its review lives in Pantry. */
  openPantry: () => void;
}

/** Your imports for Home and Recipes. Ready cards stay until opened or dismissed (or half an hour). */
export function useImportsPanel({ notify, openRecipe, openPantry }: ImportsPanelOptions) {
  const jobs = useImportJobs();
  const seen = useSeenImports();
  const recovery = useImportRecovery(notify);
  const list = (jobs.data ?? []).filter((j) => j.status !== 'done' || (seen !== null && !seen.has(j.id)));
  const now = Date.now();
  const rows: ImportRowView[] = list.map((job) => {
    const item = importItemView(job, now);
    const open = item.proposalId ? openPantry : item.recipeId ? () => openRecipe(item.recipeId!) : undefined;
    return {
      key: item.id,
      state: item.state,
      title: item.title,
      caption: item.caption,
      thumbnailUri: item.thumbnailUri,
      progress: item.progress,
      actions: item.recovery.map((a) => ({
        key: a.kind,
        label: a.label,
        loading: a.kind === 'retry' && recovery.retryingId === job.id,
        onPress: () => recovery.run(job, a.kind),
      })),
      onOpen: open
        ? () => {
            markImportSeen(job.id);
            open();
          }
        : undefined,
      openLabel: item.proposalId ? 'Review' : 'Open recipe',
      // A failed one goes away for good (its job is deleted); a finished one is only marked seen.
      onDismiss: item.recovery.some((a) => a.kind === 'remove') ? () => recovery.run(job, 'remove') : () => markImportSeen(job.id),
    };
  });
  return {
    title: rows.some((r) => r.state !== 'ready') ? 'Saving' : 'Just saved',
    rows,
    refetch: jobs.refetch,
  };
}

/** One of your imports, followed after sharing (the Import screen). */
export function useImportJob(id: string | null): ImportView | null {
  const jobs = useImportJobs();
  return (id && jobs.data?.find((j) => j.id === id)) || null;
}

export interface ImportEvent {
  id: string;
  /** The dish, or what was shared. */
  title: string;
  recipeId: string | null;
  proposalId: string | null;
  alreadySaved: boolean;
  /** Why it failed (null when it worked). */
  error: string | null;
}

/** Calls back once when one of your imports finishes or fails while the app is open (toast + haptic). */
export function useImportEvents(on: { ready: (event: ImportEvent) => void; failed: (event: ImportEvent) => void }): void {
  const jobs = useImportJobs();
  const working = useRef<Set<string> | null>(null);
  const callbacks = useRef(on);
  callbacks.current = on;
  useEffect(() => {
    const data = jobs.data;
    if (!data) return;
    const before = working.current;
    working.current = new Set(data.filter(isWorking).map((j) => j.id));
    if (!before) return;
    for (const j of data) {
      if (!before.has(j.id) || isWorking(j)) continue;
      const event: ImportEvent = {
        id: j.id,
        title: j.recipe?.title ?? j.preview_title ?? importSource(j),
        recipeId: j.recipe_id,
        proposalId: j.proposal_id,
        alreadySaved: j.already_saved,
        error: j.status === 'failed' ? j.error : null,
      };
      if (j.status === 'done') callbacks.current.ready(event);
      else if (j.status === 'failed') callbacks.current.failed(event);
    }
  }, [jobs.data]);
}
