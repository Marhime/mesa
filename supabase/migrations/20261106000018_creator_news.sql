-- New from your creators (Nov 2026): once a day the worker looks at the creators each household follows
-- and keeps their recipe videos in creator_videos. The first look is a baseline (nothing is "new");
-- after that, a recipe video it hasn't seen before is new until someone opens that creator, saves it
-- or dismisses it.

create table if not exists public.creator_videos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  channel_id text not null,
  url text not null check (url ~ '^https://'),
  title text not null,
  dish text,
  views bigint,
  duration_s int,
  thumbnail text,
  is_recipe boolean not null default true,
  is_new boolean not null default false,
  first_seen_at timestamptz not null default now(),
  unique (household_id, url)
);
create index if not exists creator_videos_new on public.creator_videos (household_id, is_new) where is_new;
alter table public.creator_videos enable row level security;
create policy creator_videos_read on public.creator_videos for select to authenticated
  using (household_id = public.current_household_id());
create policy creator_videos_seen on public.creator_videos for update to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
-- The worker writes rows; the app only marks them seen.
revoke insert, update, delete on public.creator_videos from authenticated, anon;
grant select on public.creator_videos to authenticated;
grant update (is_new) on public.creator_videos to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creator_videos') then
    alter publication supabase_realtime add table public.creator_videos;
  end if;
end
$$;

-- kind 'follow_check': one per household that follows someone, queued once a day. Like tidy, it runs
-- only when nobody waits, never counts toward the daily import cap and never expires in the queue.
alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check
  check (kind in ('recipe', 'sweep', 'receipt', 'tidy', 'idea', 'translate', 'creator', 'follow_check'));

-- The app may not queue background kinds itself.
drop policy if exists import_jobs_add on public.import_jobs;
create policy import_jobs_add on public.import_jobs for insert to authenticated
  with check (household_id = public.current_household_id() and kind not in ('tidy', 'follow_check'));

create or replace function public.import_job_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind not in ('tidy', 'follow_check') and (
      select count(*) from public.import_jobs
      where household_id = new.household_id and kind not in ('tidy', 'follow_check') and created_at > now() - interval '1 day'
    ) >= 60 then
      raise exception 'Too many imports today. Try again tomorrow.' using errcode = 'P0001';
    end if;
    new.queued_at := now();
  elsif new.status = 'queued' and old.status is distinct from 'queued' then
    new.queued_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.expire_stale_jobs()
returns int
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.import_jobs
      set status = 'failed',
          error = 'The recipe reader is busy right now. Try again in a few minutes.',
          error_code = 'aiBusy',
          stage = null,
          finished_at = now()
      where status = 'queued' and kind not in ('tidy', 'follow_check') and queued_at < now() - interval '20 minutes'
      returning 1
  )
  select count(*)::int from expired
$$;
revoke execute on function public.expire_stale_jobs() from public, anon, authenticated;

create or replace function public.claim_import_job()
returns setof public.import_jobs
language plpgsql
set search_path = public
as $$
begin
  update public.import_jobs
    set status = 'queued', stage = null, stage_at = null
    where status = 'processing' and started_at < now() - interval '10 minutes' and attempts < 3;
  update public.import_jobs
    set status = 'failed',
        error = coalesce(error, 'This took too long. Send a screenshot or paste the text instead.'),
        error_code = coalesce(error_code, 'timeout'),
        finished_at = now()
    where status = 'processing' and started_at < now() - interval '10 minutes' and attempts >= 3;

  return query
    update public.import_jobs j
      set status = 'processing', started_at = now(), attempts = j.attempts + 1, stage = 'opening', stage_at = now()
      where j.id = (
        select id from public.import_jobs
        where status = 'queued'
        order by (kind in ('tidy', 'follow_check')), created_at
        for update skip locked
        limit 1
      )
      returning j.*;
end;
$$;
revoke execute on function public.claim_import_job() from public, anon, authenticated;
grant execute on function public.claim_import_job() to service_role;

-- Queues today's look for every household that follows someone (and has none waiting).
create or replace function public.queue_follow_checks()
returns int
language sql
security definer
set search_path = public
as $$
  with queued as (
    insert into public.import_jobs (household_id, kind, input_text)
    select distinct f.household_id, 'follow_check', 'daily'
    from public.followed_creators f
    where not exists (
      select 1 from public.import_jobs j
      where j.household_id = f.household_id and j.kind = 'follow_check' and j.status in ('queued', 'processing')
    )
    returning 1
  )
  select count(*)::int from queued
$$;
revoke execute on function public.queue_follow_checks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mesa-follow-checks', '0 14 * * *', 'select public.queue_follow_checks()');
  end if;
end
$$;
