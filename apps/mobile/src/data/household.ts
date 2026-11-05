import type { Household, Profile } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from './auth';
import { rpc } from './rpc';
import { must, supabase } from './supabase';

export const householdKeys = {
  profile: (userId: string | null) => ['profile', userId] as const,
  household: (id: string | null) => ['household', id] as const,
  members: (id: string | null) => ['members', id] as const,
};

/** The signed-in person's profile (household_id is null until setup). */
export function useProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: householdKeys.profile(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const row = must(
        await supabase.from('profiles').select('id, household_id, display_name, created_at').eq('id', userId!).maybeSingle(),
      ) as Profile | null;
      return row ?? { id: userId!, household_id: null, display_name: null, created_at: new Date().toISOString() };
    },
  });
}

export function useHouseholdId(): string | null {
  return useProfile().data?.household_id ?? null;
}

export function useHousehold() {
  const id = useHouseholdId();
  return useQuery({
    queryKey: householdKeys.household(id),
    enabled: !!id,
    queryFn: async (): Promise<Household> =>
      must(await supabase.from('households').select('id, name, default_servings, created_at').eq('id', id!).single()) as Household,
  });
}

export interface Member {
  id: string;
  name: string | null;
  isMe: boolean;
}

export function useMembers() {
  const id = useHouseholdId();
  const userId = useUserId();
  return useQuery({
    queryKey: householdKeys.members(id),
    enabled: !!id,
    queryFn: async (): Promise<Member[]> => {
      const rows = must(
        await supabase.from('profiles').select('id, display_name, created_at').eq('household_id', id!).order('created_at'),
      ) as Pick<Profile, 'id' | 'display_name'>[];
      return rows.map((r) => ({ id: r.id, name: r.display_name, isMe: r.id === userId }));
    },
  });
}

/** Names for the header: me first, then the others; "Shared with Karla". */
export function useHouseholdPeople(): { names: (string | null)[]; sharedWith: string } {
  const members = useMembers().data ?? [];
  const me = members.filter((m) => m.isMe);
  const others = members.filter((m) => !m.isMe);
  const otherNames = others.map((m) => m.name ?? 'your partner');
  const sharedWith =
    otherNames.length === 0 ? 'Just you for now' : `Shared with ${otherNames.slice(0, 2).join(' and ')}${otherNames.length > 2 ? ' and others' : ''}`;
  return { names: [...me, ...others].map((m) => m.name), sharedWith };
}

export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, servings }: { name: string; servings: number }) => {
      const id = await rpc('create_household', { p_name: name.trim() });
      must(await supabase.from('households').update({ default_servings: servings }).eq('id', id));
      return id;
    },
    // Settled, not success: if only the servings update failed, the household exists and the
    // profile must be re-read (a second "Create" would fail with "already in a household").
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useJoinHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => rpc('join_household', { p_code: code.trim().toUpperCase() }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useUpdateHousehold() {
  const qc = useQueryClient();
  const id = useHouseholdId();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Household, 'name' | 'default_servings'>>) => {
      must(await supabase.from('households').update(patch).eq('id', id!));
    },
    onMutate: async (patch) => {
      const key = householdKeys.household(id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Household>(key);
      if (prev) qc.setQueryData<Household>(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(householdKeys.household(id), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: householdKeys.household(id) }),
  });
}

export function useUpdateDisplayName() {
  const qc = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: async (name: string) => {
      must(await supabase.from('profiles').update({ display_name: name.trim() || null }).eq('id', userId!));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export function useCreateInvite() {
  return useMutation({ mutationFn: () => rpc('create_invite', {}) });
}
