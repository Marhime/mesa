-- The smart kitchen (roadmap, Nov 2026): For you + Find me, Plan my week, Adapt a recipe, Ask Mesa.
--   Background kind: for_you (weekly, per household: real recipe videos chosen for the household, kept in
--     `suggestions`). Asked kinds (the answer goes in import_jobs.result, see packages/shared/src/types.ts):
--     find (input_text = what to find) → FoundVideos; plan (input_text = wishes, or 'week') → WeekPlan;
--     adapt (subject_id = recipe, input_text = the change) → RecipeAdaptation; ask (input_text = the question,
--     input_context = earlier turns) → AskAnswer.
--   One place says which kinds run in the background (no quota, no expiry, after people's jobs).

create or replace function public.is_background_kind(p_kind text)
returns boolean
language sql
immutable
as $$
  select p_kind in ('tidy', 'follow_check', 'for_you')
$$;

alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check check (kind in (
  'recipe', 'sweep', 'receipt', 'tidy', 'idea', 'translate', 'creator', 'follow_check',
  'for_you', 'find', 'plan', 'adapt', 'ask'
));
-- Earlier turns of an Ask Mesa conversation ([{q, a}], newest last).
alter table public.import_jobs add column if not exists input_context jsonb;

drop policy if exists import_jobs_add on public.import_jobs;
create policy import_jobs_add on public.import_jobs for insert to authenticated
  with check (household_id = public.current_household_id() and not public.is_background_kind(kind));

create or replace function public.import_job_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_background_kind(new.kind) and (
      select count(*) from public.import_jobs
      where household_id = new.household_id and not public.is_background_kind(kind) and created_at > now() - interval '1 day'
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
      where status = 'queued' and not public.is_background_kind(kind) and queued_at < now() - interval '20 minutes'
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
        order by public.is_background_kind(kind), created_at
        for update skip locked
        limit 1
      )
      returning j.*;
end;
$$;
revoke execute on function public.claim_import_job() from public, anon, authenticated;
grant execute on function public.claim_import_job() to service_role;

-- For you: what the weekly look found -------------------------------------------------------------

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  job_id uuid references public.import_jobs(id) on delete set null,
  url text not null check (url ~ '^https://'),
  platform public.import_platform not null default 'youtube',
  title text not null,
  creator text,
  creator_channel_id text,
  thumbnail text,
  duration_s int,
  views bigint,
  language text,
  dish text,
  -- One line: why it fits this household ("Like the tinga you made twice").
  why text not null,
  score numeric not null default 0,
  status text not null default 'new' check (status in ('new', 'saved', 'dismissed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 days',
  unique (household_id, url)
);
create index if not exists suggestions_open on public.suggestions (household_id, status, expires_at);
alter table public.suggestions enable row level security;
create policy suggestions_read on public.suggestions for select to authenticated
  using (household_id = public.current_household_id());
create policy suggestions_decide on public.suggestions for update to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
revoke insert, update, delete on public.suggestions from authenticated, anon;
grant select on public.suggestions to authenticated;
grant update (status) on public.suggestions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suggestions') then
    alter publication supabase_realtime add table public.suggestions;
  end if;
end
$$;

-- Queues this week's look for every household with at least one recipe (and none waiting).
create or replace function public.queue_for_you()
returns int
language sql
security definer
set search_path = public
as $$
  with queued as (
    insert into public.import_jobs (household_id, kind, input_text)
    select distinct r.household_id, 'for_you', 'weekly'
    from public.recipes r
    where not exists (
      select 1 from public.import_jobs j
      where j.household_id = r.household_id and j.kind = 'for_you' and j.status in ('queued', 'processing')
    )
    returning 1
  )
  select count(*)::int from queued
$$;
revoke execute on function public.queue_for_you() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mesa-for-you', '0 13 * * 1', 'select public.queue_for_you()');
  end if;
end
$$;
