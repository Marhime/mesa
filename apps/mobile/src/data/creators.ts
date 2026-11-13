// The household's creators ("Follow"): whose latest recipes stay one tap away in Recipes, and when the
// household last looked at them. Both phones see a follow at once (live sync).
import type { ImportPlatform } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreatorRef, CreatorTarget } from './creatorVideos';
import { errorCode } from './errors';
import { useHouseholdId } from './household';
import { FOLLOWED_CREATORS_KEY } from './keys';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

export { FOLLOWED_CREATORS_KEY };
const KEY = FOLLOWED_CREATORS_KEY;
const COLUMNS = 'id, platform, channel_id, name, url, last_seen_at, created_at';
const UNIQUE_VIOLATION = '23505';

export interface FollowedCreator {
  id: string;
  platform: ImportPlatform;
  channel_id: string;
  name: string;
  url: string;
  /** When their videos were last looked at; newer ones are "new". */
  last_seen_at: string | null;
  created_at: string;
}

/** Who the household follows, the latest follow first. */
export function useFollowedCreators() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<FollowedCreator[]> =>
      must(await supabase.from('followed_creators').select(COLUMNS).order('created_at', { ascending: false })) as FollowedCreator[],
  });
}

/** Follow or unfollow a creator; the list changes at once and goes back if the write fails. */
export function useFollowCreator() {
  const qc = useQueryClient();
  return useMutation({
    meta: { errorMessage: "Couldn't save that. Try again." },
    mutationFn: async ({ creator, follow }: { creator: CreatorRef; follow: boolean }) => {
      if (!follow) {
        must(await supabase.from('followed_creators').delete().eq('channel_id', creator.channelId));
        return;
      }
      const { error } = await supabase.from('followed_creators').insert({
        platform: creator.platform,
        channel_id: creator.channelId,
        name: creator.name,
        url: creator.url,
        // Following happens while looking at their videos.
        last_seen_at: new Date().toISOString(),
      });
      // Already followed (from the other phone): nothing to do.
      if (error && errorCode(error) !== UNIQUE_VIOLATION) throw error;
    },
    onMutate: async ({ creator, follow }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<FollowedCreator[]>(KEY);
      const now = new Date().toISOString();
      qc.setQueryData<FollowedCreator[]>(KEY, (list = []) => {
        const rest = list.filter((c) => c.channel_id !== creator.channelId);
        if (!follow) return rest;
        const row: FollowedCreator = {
          id: `pending-${creator.channelId}`,
          platform: creator.platform,
          channel_id: creator.channelId,
          name: creator.name,
          url: creator.url,
          last_seen_at: now,
          created_at: now,
        };
        return [row, ...rest];
      });
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: () => refresh(qc, 'creators'),
  });
}

/** Their sheet was opened: what they posted until now is no longer new. Silent on failure. */
export function useMarkCreatorSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      must(await supabase.from('followed_creators').update({ last_seen_at: new Date().toISOString() }).eq('channel_id', channelId));
    },
    onMutate: (channelId) => {
      const now = new Date().toISOString();
      qc.setQueryData<FollowedCreator[]>(KEY, (list) => list?.map((c) => (c.channel_id === channelId ? { ...c, last_seen_at: now } : c)));
    },
  });
}

/** A followed creator's sheet lists their channel. */
export function followedTarget(c: Pick<FollowedCreator, 'url' | 'name' | 'channel_id'>): CreatorTarget {
  return { url: c.url, name: c.name, channelId: c.channel_id };
}
