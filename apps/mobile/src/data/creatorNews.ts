// "New from your creators": recipe videos the daily follow_check found since the household last looked
// (creator_videos, written by the worker). The app only reads them and marks them seen: opening that
// creator, saving one, or "Not now". Both phones see it at once (live sync).
import type { CreatorVideo } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { formatMinutes } from '../lib/text';
import { useFollowedCreators, type FollowedCreator } from './creators';
import { useHouseholdId } from './household';
import { CREATOR_NEWS_KEY } from './keys';
import { useRecipes, type RecipeSummary } from './recipes';
import { refresh } from './refresh';
import { youtubeVideoId } from './stepVideo';
import { must, supabase } from './supabase';

export { CREATOR_NEWS_KEY };
const KEY = CREATOR_NEWS_KEY;
const COLUMNS = 'id, channel_id, url, title, duration_s, thumbnail, first_seen_at';
/** Read for the counts on "Your creators"; the section shows fewer. */
const MAX_READ = 60;
const MAX_SHOWN = 10;

type NewVideoRow = Pick<CreatorVideo, 'id' | 'channel_id' | 'url' | 'title' | 'duration_s' | 'thumbnail' | 'first_seen_at'>;

/** One new video, ready for its card. */
export interface NewVideoView {
  /** The row id. */
  key: string;
  url: string;
  title: string;
  /** "Food is Love · 9 min". */
  meta: string;
  thumbnail: string | null;
  channelId: string;
}

export interface CreatorNews {
  /** Newest first, at most ten. */
  videos: NewVideoView[];
  /** New videos per channel id (all of them, not only the ten shown). */
  counts: ReadonlyMap<string, number>;
}

/** The same video whatever the link looks like: its YouTube id, else the link itself. */
export function videoIdentity(url: string | null | undefined): string | null {
  const u = url?.trim();
  return u ? (youtubeVideoId(u) ?? u) : null;
}

/**
 * What to show: new videos of creators still followed, minus those already in Recipes (same YouTube
 * video), newest first. Pure.
 */
export function creatorNews(
  rows: NewVideoRow[],
  followed: Pick<FollowedCreator, 'channel_id' | 'name'>[],
  recipes: Pick<RecipeSummary, 'source_url'>[],
): CreatorNews {
  const names = new Map(followed.map((c) => [c.channel_id, c.name]));
  const saved = new Set(recipes.map((r) => videoIdentity(r.source_url)).filter((id): id is string => !!id));
  const seen = new Set<string>();
  const videos: NewVideoView[] = [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = names.get(row.channel_id);
    const id = videoIdentity(row.url);
    if (!name || !id || saved.has(id) || seen.has(id) || row.title.trim() === '') continue;
    seen.add(id);
    counts.set(row.channel_id, (counts.get(row.channel_id) ?? 0) + 1);
    const minutes = row.duration_s && row.duration_s > 0 ? formatMinutes(Math.max(1, Math.round(row.duration_s / 60))) : null;
    videos.push({
      key: row.id,
      url: row.url,
      title: row.title.trim(),
      meta: [name, minutes].filter(Boolean).join(' · '),
      thumbnail: row.thumbnail && /^https?:\/\//i.test(row.thumbnail) ? row.thumbnail : null,
      channelId: row.channel_id,
    });
  }
  return { videos: videos.slice(0, MAX_SHOWN), counts };
}

function useNewVideoRows() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<NewVideoRow[]> =>
      must(
        await supabase
          .from('creator_videos')
          .select(COLUMNS)
          .eq('is_new', true)
          .eq('is_recipe', true)
          .order('first_seen_at', { ascending: false })
          .limit(MAX_READ),
      ) as NewVideoRow[],
  });
}

/** New videos from the creators the household follows, and how many per creator. */
export function useCreatorNews(): CreatorNews {
  const rows = useNewVideoRows();
  const followed = useFollowedCreators();
  const recipes = useRecipes();
  return useMemo(() => creatorNews(rows.data ?? [], followed.data ?? [], recipes.data ?? []), [rows.data, followed.data, recipes.data]);
}

/** Some videos (saved, "Not now"), or all of one creator's (their sheet was opened). */
export type SeenVideos = { ids: string[] } | { channelId: string };

/** No longer new: gone from the section at once, back if the write fails (silently: nothing was lost). */
export function useMarkVideosSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seen: SeenVideos) => {
      const update = supabase.from('creator_videos').update({ is_new: false }).eq('is_new', true);
      must(await ('ids' in seen ? update.in('id', seen.ids) : update.eq('channel_id', seen.channelId)));
    },
    onMutate: async (seen) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<NewVideoRow[]>(KEY);
      const gone = (row: NewVideoRow) => ('ids' in seen ? seen.ids.includes(row.id) : row.channel_id === seen.channelId);
      qc.setQueryData<NewVideoRow[]>(KEY, (list) => list?.filter((row) => !gone(row)));
      return { previous };
    },
    onError: (_e, _seen, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: () => refresh(qc, 'creatorNews'),
  });
}
