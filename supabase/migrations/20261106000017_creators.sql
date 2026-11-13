-- Your creators (Nov 2026): good recipes come from cooks you already trust.
--   1. A recipe remembers who made it (name, channel URL and id) — the base for "More from Food is Love".
--   2. followed_creators: the household's creators ("Follow"), with when it last looked at their videos
--      (videos after that are "New").
--   3. kind 'creator': the worker lists a creator's latest recipe videos (from a channel URL, or from a
--      saved recipe) into import_jobs.result (CreatorVideos in packages/shared/src/types.ts).

alter table public.recipes add column if not exists source_author text;
alter table public.recipes add column if not exists source_channel_url text;
alter table public.recipes add column if not exists source_channel_id text;
create index if not exists recipes_channel on public.recipes (household_id, source_channel_id) where source_channel_id is not null;

create table if not exists public.followed_creators (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  platform public.import_platform not null default 'youtube',
  channel_id text not null,
  name text not null,
  url text not null check (url ~ '^https://'),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, channel_id)
);
alter table public.followed_creators enable row level security;
create policy followed_creators_all on public.followed_creators for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
grant select, insert, update, delete on public.followed_creators to authenticated;

-- Both phones see a follow at once.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'followed_creators') then
    alter publication supabase_realtime add table public.followed_creators;
  end if;
end
$$;

alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check
  check (kind in ('recipe', 'sweep', 'receipt', 'tidy', 'idea', 'translate', 'creator'));
