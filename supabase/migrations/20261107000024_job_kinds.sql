-- One registry of job kinds, and a fair queue (Nov 2026).
--   1. public.job_kinds: one row per kind of import job, the same rows as JOB_KINDS in
--      packages/shared/src/job-kinds.ts (`pnpm -s --filter @mesa/shared gen:job-kinds` prints the insert
--      below; packages/shared/test/job-kinds.test.ts compares both through db-tests/schema.sql).
--      import_jobs.kind references it (no more check constraint to rewrite for each kind), and
--      is_background_kind, is_quick_kind, the daily quota and the queue's expiry read it.
--      'adapt' goes: it was allowed but handled nowhere (the worker read it as a recipe import).
--   2. Server work never competes with people. A job the server queued (created_by null: tidy, follow_check,
--      for_you, the one-time rereads of migrations 22 and 23) never counts toward the 60 jobs a day, never
--      expires in the queue, never takes the quick lane, and runs after every job a person queued.
--      The app may only queue jobs in its person's name (created_by = auth.uid(), the column's default).
--   3. A fair claim. In the 'any' lane a household runs one job at a time (a person's job waits only for
--      that household's other person's job, never for server work), and households take turns: among
--      jobs of the same rank, the household served longest ago goes first.
-- Deploy: this migration before the worker that comes with it (docs/CONTRACT.md); the running worker keeps
-- working: claim_import_job keeps its arguments and its rows.

-- 1. Job kinds -----------------------------------------------------------------------------------------

create table if not exists public.job_kinds (
  kind text primary key check (kind ~ '^[a-z_]+$'),
  -- quick: someone waits on the screen; any: people's other jobs; background: the server's own work.
  lane text not null check (lane in ('quick', 'any', 'background')),
  counts_toward_quota boolean not null,
  expires_in_queue boolean not null,
  -- Background work is nobody's: no quota, nobody waiting for it.
  constraint job_kinds_background_is_free check (lane <> 'background' or not (counts_toward_quota or expires_in_queue))
);
alter table public.job_kinds enable row level security;
drop policy if exists job_kinds_read on public.job_kinds;
create policy job_kinds_read on public.job_kinds for select to authenticated using (true);
revoke insert, update, delete, truncate on public.job_kinds from anon, authenticated;
grant select on public.job_kinds to authenticated, service_role;

-- Generated: pnpm -s --filter @mesa/shared gen:job-kinds
insert into public.job_kinds (kind, lane, counts_toward_quota, expires_in_queue) values
  ('recipe', 'any', true, true),
  ('sweep', 'any', true, true),
  ('receipt', 'any', true, true),
  ('tidy', 'background', false, false),
  ('idea', 'any', true, true),
  ('translate', 'any', true, true),
  ('creator', 'any', true, true),
  ('follow_check', 'background', false, false),
  ('for_you', 'background', false, false),
  ('find', 'any', true, true),
  ('plan', 'any', true, true),
  ('ask', 'quick', true, true),
  ('reread', 'quick', true, true)
on conflict (kind) do update set
  lane = excluded.lane,
  counts_toward_quota = excluded.counts_toward_quota,
  expires_in_queue = excluded.expires_in_queue;

-- Rows of a kind no longer known ('adapt'): the app stopped queuing them when Ask Mesa took over adapting.
delete from public.import_jobs where kind not in (select kind from public.job_kinds);

alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs drop constraint if exists import_jobs_kind_fk;
alter table public.import_jobs add constraint import_jobs_kind_fk foreign key (kind) references public.job_kinds (kind);

create or replace function public.is_background_kind(p_kind text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.job_kinds where kind = p_kind and lane = 'background')
$$;

create or replace function public.is_quick_kind(p_kind text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.job_kinds where kind = p_kind and lane = 'quick')
$$;

-- 2. People first ----------------------------------------------------------------------------------------

-- Who goes first: 0 a person's quick job, 1 a person's other job, 2 server work in a people lane (the
-- one-time rereads), 3 background work. A person's job is one with created_by, outside the background lane.
create or replace function public.job_rank(p_lane text, p_created_by uuid)
returns int
language sql
immutable
as $$
  select case
    when p_lane = 'background' then 3
    when p_created_by is null then 2
    when p_lane = 'quick' then 0
    else 1
  end
$$;

-- The household's jobs of the last 24 hours that count toward its 60: queued by a person, of a kind that counts.
create or replace function public.people_jobs_today(p_household uuid)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.import_jobs j
  join public.job_kinds k on k.kind = j.kind
  where j.household_id = p_household
    and j.created_by is not null
    and k.counts_toward_quota
    and j.created_at > now() - interval '1 day'
$$;

create or replace function public.import_job_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is not null
       and exists (select 1 from public.job_kinds where kind = new.kind and counts_toward_quota)
       and public.people_jobs_today(new.household_id) >= 60 then
      raise exception 'Too many imports today. Try again tomorrow.' using errcode = 'P0001';
    end if;
    new.queued_at := now();
  elsif new.status = 'queued' and old.status is distinct from 'queued' then
    new.queued_at := now();
  end if;
  return new;
end;
$$;

-- The app queues only in its person's name: a job without created_by is the server's (no quota).
drop policy if exists import_jobs_add on public.import_jobs;
create policy import_jobs_add on public.import_jobs for insert to authenticated
  with check (
    household_id = public.current_household_id()
    and created_by = auth.uid()
    and not public.is_background_kind(kind)
  );

-- Nobody waits forever for a person's job; the server's own work waits its turn.
create or replace function public.expire_stale_jobs()
returns int
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.import_jobs j
      set status = 'failed',
          error = 'The recipe reader is busy right now. Try again in a few minutes.',
          error_code = 'aiBusy',
          stage = null,
          finished_at = now()
      from public.job_kinds k
      where k.kind = j.kind
        and k.expires_in_queue
        and j.created_by is not null
        and j.status = 'queued'
        and j.queued_at < now() - interval '20 minutes'
      returning 1
  )
  select count(*)::int from expired
$$;
revoke execute on function public.expire_stale_jobs() from public, anon, authenticated;

-- 3. A fair claim --------------------------------------------------------------------------------------

-- The lane that claimed the job: a household runs one job at a time in the 'any' lane.
alter table public.import_jobs add column if not exists claimed_lane text;
alter table public.import_jobs drop constraint if exists import_jobs_claimed_lane;
alter table public.import_jobs add constraint import_jobs_claimed_lane check (claimed_lane is null or claimed_lane in ('any', 'quick'));
create index if not exists import_jobs_running on public.import_jobs (household_id) where status = 'processing';
create index if not exists import_jobs_served on public.import_jobs (household_id, started_at desc) where started_at is not null;

create or replace function public.claim_import_job(p_lane text default 'any')
returns setof public.import_jobs
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_lane is null or p_lane not in ('any', 'quick') then
    raise exception 'unknown lane: %', p_lane using errcode = '22023';
  end if;
  -- One claim at a time: the one-job-per-household rule must see the job the claim before just started.
  perform pg_advisory_xact_lock(hashtext('public.claim_import_job'));

  update public.import_jobs
    set status = 'queued', stage = null, stage_at = null, draft = null
    where status = 'processing' and started_at < now() - interval '10 minutes' and attempts < 3;
  update public.import_jobs
    set status = 'failed',
        error = coalesce(error, 'This took too long. Send a screenshot or paste the text instead.'),
        error_code = coalesce(error_code, 'timeout'),
        draft = null,
        finished_at = now()
    where status = 'processing' and started_at < now() - interval '10 minutes' and attempts >= 3;

  with waiting as (
    -- The quick lane takes only a person's quick jobs.
    select j.id, j.household_id, j.created_at, public.job_rank(k.lane, j.created_by) as rank
    from public.import_jobs j
    join public.job_kinds k on k.kind = j.kind
    where j.status = 'queued'
      and (p_lane = 'any' or (k.lane = 'quick' and j.created_by is not null))
  ), running as (
    select r.household_id, bool_or(public.job_rank(k.lane, r.created_by) <= 1) as people
    from public.import_jobs r
    join public.job_kinds k on k.kind = r.kind
    where r.status = 'processing' and r.claimed_lane = 'any'
    group by r.household_id
  ), next_of_household as (
    -- In the 'any' lane, a household with a job running there waits (a person's job only for a person's job).
    select distinct on (w.household_id) w.*
    from waiting w
    left join running r on r.household_id = w.household_id
    where p_lane = 'quick' or r.household_id is null or (w.rank <= 1 and not r.people)
    order by w.household_id, w.rank, w.created_at
  )
  select n.id into v_id
  from next_of_household n
  order by n.rank,
           -- Taking turns: the household served longest ago (or never) first.
           (select max(s.started_at) from public.import_jobs s where s.household_id = n.household_id and s.started_at is not null) nulls first,
           n.created_at
  limit 1;

  if v_id is null then
    return;
  end if;
  return query
    update public.import_jobs j
      set status = 'processing', started_at = now(), attempts = j.attempts + 1, stage = 'opening', stage_at = now(),
          draft = null, claimed_lane = p_lane
      where j.id = v_id and j.status = 'queued'
      returning j.*;
end;
$$;
revoke execute on function public.claim_import_job(text) from public, anon, authenticated;
grant execute on function public.claim_import_job(text) to service_role;
