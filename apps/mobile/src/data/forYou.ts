// "For you this week" in Recipes: real recipe videos the weekly for_you look chose for the household
// (`suggestions`, written by the worker), each with why it fits. The app only reads them and decides:
// Save (an import, then 'saved'), Watch (in-app browser), "Not for us" ('dismissed': fewer like this).
// Both phones see it at once (live sync).
import type { Suggestion } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { friendlyError } from './errors';
import { foundVideoView, isSavedVideo, savedVideoIds, type FoundVideoView } from './foundVideo';
import { useHouseholdId } from './household';
import { FOR_YOU_KEY } from './keys';
import { useRecipes, type RecipeSummary } from './recipes';
import { refresh } from './refresh';
import { useSaveVideo } from './saveVideo';
import { must, supabase } from './supabase';
import { useOpenInApp } from './system';

export { FOR_YOU_KEY };
const KEY = FOR_YOU_KEY;
const COLUMNS = 'id, url, title, creator, duration_s, thumbnail, why, score, created_at, expires_at';
const MAX_READ = 20;
const MAX_SHOWN = 5;
/** Until this many recipes, there is nothing to pick from: no word about the first look either. */
const FIRST_LOOK_MIN_RECIPES = 3;

type SuggestionRow = Pick<
  Suggestion,
  'id' | 'url' | 'title' | 'creator' | 'duration_s' | 'thumbnail' | 'why' | 'score' | 'created_at' | 'expires_at'
>;

interface ForYouRows {
  /** Still to decide (new, not expired). */
  open: SuggestionRow[];
  /** The household ever had one (else the first weekly look hasn't come yet). */
  any: boolean;
}

/**
 * What to show: open suggestions not expired and not already in Recipes, this week's first then the best
 * fits, at most five. Pure.
 */
export function forYouViews(rows: SuggestionRow[], recipes: Pick<RecipeSummary, 'source_url'>[], now = Date.now()): FoundVideoView[] {
  const saved = savedVideoIds(recipes);
  return rows
    .filter((r) => Date.parse(r.expires_at) > now && !isSavedVideo(r.url, saved))
    .sort((a, b) => b.created_at.slice(0, 10).localeCompare(a.created_at.slice(0, 10)) || Number(b.score) - Number(a.score))
    .map((r) => foundVideoView(r, r.id))
    .filter((v): v is FoundVideoView => !!v)
    .slice(0, MAX_SHOWN);
}

function useSuggestionRows() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<ForYouRows> => {
      const open = must(
        await supabase
          .from('suggestions')
          .select(COLUMNS)
          .eq('status', 'new')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(MAX_READ),
      ) as SuggestionRow[];
      if (open.length > 0) return { open, any: true };
      const some = must(await supabase.from('suggestions').select('id').limit(1)) as { id: string }[];
      return { open, any: some.length > 0 };
    },
  });
}

/** Saved or "Not for us": gone from the rail at once, back if the write fails. */
function useDecideSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'saved' | 'dismissed' }) => {
      must(await supabase.from('suggestions').update({ status }).eq('id', id));
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<ForYouRows>(KEY);
      qc.setQueryData<ForYouRows>(KEY, (data) => (data ? { ...data, open: data.open.filter((r) => r.id !== id) } : data));
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: () => refresh(qc, 'forYou'),
  });
}

export interface ForYouOptions {
  /** A failed save or "Not for us", in the person's words. */
  onError: (message: string) => void;
  /** "Not for us" was heard ("Fewer like this"). */
  onDismissed: () => void;
}

/**
 * "For you this week": `onSave` starts one import (its "Saving" row shows in the imports list) and the
 * suggestion is saved; `onDismiss` is "Not for us"; `onWatch` opens it in the in-app browser.
 * `firstLook`: nothing came yet but the household has recipes enough: the first look is coming.
 */
export function useForYou({ onError, onDismissed }: ForYouOptions) {
  const rows = useSuggestionRows();
  const recipes = useRecipes();
  const { mutate: decide } = useDecideSuggestion();
  const openInApp = useOpenInApp();
  const saver = useSaveVideo(onError);
  const videos = useMemo(() => forYouViews(rows.data?.open ?? [], recipes.data ?? []), [rows.data, recipes.data]);
  const find = (key: string) => videos.find((v) => v.key === key);

  return {
    videos,
    refetch: rows.refetch,
    firstLook: !!rows.data && !rows.data.any && (recipes.data?.length ?? 0) >= FIRST_LOOK_MIN_RECIPES,
    /** The suggestion whose import is starting. */
    savingKey: saver.saving,
    onSave: (key: string) => {
      const video = find(key);
      if (video) saver.save(key, video, () => decide({ id: key, status: 'saved' }));
    },
    onWatch: (key: string) => {
      const video = find(key);
      if (video) openInApp(video.url);
    },
    onDismiss: (key: string) => {
      decide({ id: key, status: 'dismissed' }, { onError: (e) => onError(friendlyError(e, "Couldn't hide it. Try again.")) });
      onDismissed();
    },
  };
}
