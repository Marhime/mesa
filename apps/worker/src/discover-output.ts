// What a run hands back: the winning videos as FoundVideo (a "Find me" answer), or as rows of
// `suggestions` (the weekly look; the database sets expires_at, a link already suggested is left alone).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FoundVideo, FoundVideos } from '@mesa/shared';

import { CHANNEL_ID } from './channel-url';
import type { Ranked } from './discover-rank';

/** A suggestions row as the worker writes it. */
export interface SuggestionInsert extends FoundVideo {
  household_id: string;
  job_id: string;
  score: number;
  status: 'new';
}

const whole = (n: number | null): number | null => (n === null ? null : Math.round(n));

export function foundVideo({ candidate: c, verdict: v }: Ranked): FoundVideo {
  return {
    url: c.url,
    platform: 'youtube',
    title: c.title,
    creator: c.channel,
    creator_channel_id: c.channelId && CHANNEL_ID.test(c.channelId) ? c.channelId : null,
    thumbnail: c.thumbnail,
    duration_s: whole(c.duration),
    views: whole(c.views),
    // What YouTube says first; the model's reading of the title otherwise.
    language: c.language ?? v.language,
    dish: v.dish ?? c.dish,
    why: v.why,
  };
}

export const foundVideos = (query: string, ranked: readonly Ranked[]): FoundVideos => ({ query, videos: ranked.map(foundVideo) });

export function suggestionRows(householdId: string, jobId: string, ranked: readonly Ranked[]): SuggestionInsert[] {
  return ranked.map((r) => ({ household_id: householdId, job_id: jobId, ...foundVideo(r), score: r.score, status: 'new' }));
}

/** Inserts the rows; one already there for the same link (unique per household) is kept as it is. */
export async function storeSuggestions(db: SupabaseClient, rows: readonly SuggestionInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from('suggestions').upsert(rows, { onConflict: 'household_id,url', ignoreDuplicates: true });
  if (error) throw new Error(`suggestions insert: ${error.message}`);
}
