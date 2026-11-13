-- Jobs the app can't bend, and work done once (Nov 2026, security and costs).
--   1. What the app may write on a job. A person queues a job with its input only (kind, link, text,
--      photos, zone, subject, context, preview title): status, times, attempts, results and errors start
--      as a new job's, whatever the app sent. The one change a person may make is Try again: a failed job
--      of the household back in the queue, never a done or running one, never a background kind.
--   2. A daily count that never goes down (household_usage): each job a person queues and each Try again
--      takes one of the household's 60 a day; deleting jobs gives none back, and a job can't be backdated.
--      The count is one locked row, so two phones can't both take the 60th.
--   3. One recipe per import: save_imported_recipe writes the recipe, its lines and its steps in one
--      transaction, only for the run that holds the job (processing, same attempt: a run the queue gave
--      up on can't write), and a job that already has its recipe gets that one back
--      (recipes.import_job_id). No more duplicates when a slow run is handed out again.
--   4. Redo ingredients never overwrites an edit: apply_reread writes the lines only if the recipe is as
--      the worker read it (recipes.updated_at, which every line write moves: migration 25), under the
--      recipe's row lock, which an edit of a line waits for.
--   5. Tidying in batches: one tidy waits per household and takes everything waiting when it runs, and
--      what the model was asked about is not asked again (tidy_asked_at).
-- Deploy: migrations 26–28 first, then the worker that comes with them (it needs 3, 4, 5 and migration 28),
-- then the app. The running worker keeps working on the new database: it writes recipes and rereads its old
-- way, and reads tidy jobs that no longer name one item as a batch of products only.

-- 1 + 2. What a person may do with a job, and the daily count ------------------------------------------

create table if not exists public.household_usage (
  household_id uuid not null references public.households (id) on delete cascade,
  -- UTC day.
  day date not null,
  jobs int not null default 0 check (jobs >= 0),
  primary key (household_id, day)
);
alter table public.household_usage enable row level security;
revoke all on public.household_usage from anon, authenticated;
grant all on public.household_usage to service_role;

-- Today's jobs so far: the deploy hands out no fresh 60.
insert into public.household_usage as u (household_id, day, jobs)
select j.household_id, (j.created_at at time zone 'utc')::date, count(*)::int
from public.import_jobs j
join public.job_kinds k on k.kind = j.kind
where j.created_by is not null
  and k.counts_toward_quota
  and (j.created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
group by 1, 2
on conflict (household_id, day) do update set jobs = greatest(u.jobs, excluded.jobs);

-- Takes one of the household's 60 jobs of the day (UTC), or refuses. A person only ever spends their own
-- kitchen's, today's; the server may book a job on the day it was made (tests, backfills).
create or replace function public.take_job_slot(p_household uuid, p_day date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs int;
  v_day date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is not null then
    if p_household is distinct from public.current_household_id() then
      raise exception 'not your kitchen' using errcode = '42501';
    end if;
  elsif p_day is not null then
    v_day := p_day;
  end if;
  insert into public.household_usage as u (household_id, day, jobs)
  values (p_household, v_day, 1)
  on conflict (household_id, day) do update set jobs = u.jobs + 1
  returning u.jobs into v_jobs;
  if v_jobs > 60 then
    raise exception 'Too many imports today. Try again tomorrow.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.take_job_slot(uuid, date) from public, anon;
grant execute on function public.take_job_slot(uuid, date) to authenticated, service_role;

-- Kept for whoever reads it: the jobs counted today.
create or replace function public.people_jobs_today(p_household uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.jobs from public.household_usage u
                   where u.household_id = p_household and u.day = (now() at time zone 'utc')::date), 0)
$$;

create or replace function public.import_job_rules()
returns trigger
language plpgsql
-- Not security definer: current_user tells the app (authenticated) from the server and its functions.
set search_path = public
as $$
declare
  v_person boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if v_person then
      -- Only the input is the app's.
      new.status := 'queued';
      new.created_at := now();
      new.attempts := 0;
      new.started_at := null;
      new.finished_at := null;
      new.recipe_id := null;
      new.proposal_id := null;
      new.already_saved := false;
      new.result := null;
      new.draft := null;
      new.error := null;
      new.error_code := null;
      new.stage := null;
      new.stage_at := null;
      new.claimed_lane := null;
      new.platform := null;
    end if;
    if new.created_by is not null
       and exists (select 1 from public.job_kinds where kind = new.kind and counts_toward_quota) then
      perform public.take_job_slot(new.household_id, case when v_person then null else (new.created_at at time zone 'utc')::date end);
    end if;
    new.queued_at := now();
    return new;
  end if;

  if v_person then
    -- Try again is all a person may do: a failed job back in the queue (the column grants keep the rest out).
    if not (old.status = 'failed' and new.status = 'queued') or public.is_background_kind(old.kind) then
      raise exception 'Only a failed job can be tried again.' using errcode = '42501';
    end if;
    new.error := null;
    new.error_code := null;
    new.stage := null;
    new.stage_at := null;
    new.finished_at := null;
    if exists (select 1 from public.job_kinds where kind = old.kind and counts_toward_quota) then
      perform public.take_job_slot(old.household_id);
    end if;
  end if;
  if new.status = 'queued' and old.status is distinct from 'queued' then
    new.queued_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists import_jobs_rules on public.import_jobs;
create trigger import_jobs_rules before insert or update on public.import_jobs
  for each row execute function public.import_job_rules();

-- Signed-out visitors have no business with jobs (RLS let them do nothing already).
revoke all on public.import_jobs from anon;

-- 3. One recipe per import ---------------------------------------------------------------------------------

alter table public.recipes add column if not exists import_job_id uuid;
alter table public.recipes drop constraint if exists recipes_import_job_fk;
alter table public.recipes add constraint recipes_import_job_fk
  foreign key (import_job_id) references public.import_jobs (id) on delete set null;
create unique index if not exists recipes_import_job on public.recipes (import_job_id) where import_job_id is not null;

-- The run that holds the job (processing, attempt p_attempt) writes its recipe: the recipe (p_recipe: the
-- recipes columns an import sets), its lines (p_ingredients: recipe_ingredients rows without recipe_id)
-- and its steps (p_steps), all or nothing. Returns the recipe; the one already written when the job has
-- one. A run the queue gave up on gets 'job moved on' (P0004) and writes nothing.
create or replace function public.save_imported_recipe(p_job uuid, p_attempt int, p_recipe jsonb, p_ingredients jsonb, p_steps jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_job public.import_jobs;
  v_recipe uuid;
begin
  select * into v_job from public.import_jobs where id = p_job for update;
  if not found or v_job.status <> 'processing' or v_job.attempts <> p_attempt then
    raise exception 'job moved on' using errcode = 'P0004';
  end if;
  select r.id into v_recipe from public.recipes r where r.import_job_id = p_job and r.household_id = v_job.household_id;
  if found then
    return v_recipe;
  end if;

  insert into public.recipes (household_id, import_job_id, title, servings, total_minutes, source_url, source_platform,
                              image_path, source_author, source_channel_url, source_channel_id, original)
  select v_job.household_id, p_job, r.title, coalesce(r.servings, 4), r.total_minutes, r.source_url,
         coalesce(r.source_platform, 'other'), r.image_path, r.source_author, r.source_channel_url, r.source_channel_id, r.original
  from jsonb_populate_record(null::public.recipes, p_recipe) r
  returning id into v_recipe;

  insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit, is_guessed, is_optional, section)
  select v_recipe, x.position, x.raw_text, x.name, x.product_id, x.quantity, x.unit,
         coalesce(x.is_guessed, false), coalesce(x.is_optional, false), x.section
  from jsonb_populate_recordset(null::public.recipe_ingredients, coalesce(p_ingredients, '[]'::jsonb)) x;

  insert into public.recipe_steps (recipe_id, position, text, start_s)
  select v_recipe, x.position, x.text, x.start_s
  from jsonb_populate_recordset(null::public.recipe_steps, coalesce(p_steps, '[]'::jsonb)) x;

  return v_recipe;
end;
$$;
revoke execute on function public.save_imported_recipe(uuid, int, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_imported_recipe(uuid, int, jsonb, jsonb, jsonb) to service_role;

-- 4. Redo ingredients never overwrites an edit ------------------------------------------------------------

-- Writes the lines read again (p_rows: recipe_ingredients rows with their id) when the recipe is still as
-- the worker read it (p_read_at: its updated_at then). False, and nothing written, when anything changed.
-- A line's section and raw text are the person's: never written here.
create or replace function public.apply_reread(p_recipe uuid, p_read_at timestamptz, p_rows jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_updated timestamptz;
begin
  select updated_at into v_updated from public.recipes where id = p_recipe for update;
  if not found or v_updated is distinct from p_read_at then
    return false;
  end if;
  update public.recipe_ingredients i
    set position = x.position,
        name = x.name,
        product_id = x.product_id,
        quantity = x.quantity,
        unit = x.unit,
        is_guessed = coalesce(x.is_guessed, false),
        is_optional = coalesce(x.is_optional, false)
    from jsonb_populate_recordset(null::public.recipe_ingredients, p_rows) x
    where i.id = x.id and i.recipe_id = p_recipe;
  return true;
end;
$$;
revoke execute on function public.apply_reread(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_reread(uuid, timestamptz, jsonb) to service_role;

-- 5. Tidying in batches -------------------------------------------------------------------------------------

alter table public.products add column if not exists tidy_asked_at timestamptz;
alter table public.grocery_items add column if not exists tidy_asked_at timestamptz;

create or replace function public.queue_tidy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'products' then
    if new.household_id is null or (new.family is not null and new.picto is not null) then
      return new;
    end if;
  elsif new.product_id is not null or new.category <> 'other' then
    return new;
  end if;
  -- One tidy waits per household: when it runs it takes everything waiting (apps/worker/src/tidy.ts).
  insert into public.import_jobs (household_id, kind, input_text)
  select new.household_id, 'tidy', 'everything waiting'
  where not exists (select 1 from public.import_jobs j
                    where j.household_id = new.household_id and j.kind = 'tidy' and j.status = 'queued');
  return new;
end;
$$;

-- The tidies already waiting: the newest of each household stays.
delete from public.import_jobs j
where j.kind = 'tidy' and j.status = 'queued'
  and exists (select 1 from public.import_jobs n
              where n.household_id = j.household_id and n.kind = 'tidy' and n.status = 'queued'
                and (n.created_at, n.id) > (j.created_at, j.id));
-- A household with things waiting and no tidy queued gets one now, rather than at its next new item.
insert into public.import_jobs (household_id, kind, input_text)
select w.household_id, 'tidy', 'everything waiting'
from (
  select p.household_id from public.products p
  where p.household_id is not null and (p.family is null or p.picto is null)
  union
  select g.household_id from public.grocery_items g
  where g.product_id is null and g.category = 'other' and g.status = 'to_buy'
) w
where not exists (select 1 from public.import_jobs j
                  where j.household_id = w.household_id and j.kind = 'tidy' and j.status = 'queued');
