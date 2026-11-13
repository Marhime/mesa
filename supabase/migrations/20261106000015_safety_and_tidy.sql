-- Safety and a smarter catalog (expert panel 4, Nov 2026):
--   1. Import jobs: a job can only point to its own household's files; the app can only queue its own
--      imports, retry or remove them (not rewrite their inputs); at most 60 imports a day per household.
--   2. Invite codes work once.
--   3. A job left in the queue for 20 minutes (worker down) fails with "Try again" instead of waiting forever.
--   4. "Tidy": a product the household creates, or a list line Mesa doesn't know, gets a job; the worker
--      asks the AI for its family, picto, aisle, place and how long it keeps (fills empty fields only).
--   5. Recipe steps can say where they start in the video.

-- 1. Import jobs ---------------------------------------------------------------------------------

alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check check (kind in ('recipe', 'sweep', 'receipt', 'tidy'));
-- What a tidy job is about (a product or a grocery line).
alter table public.import_jobs add column if not exists subject_id uuid;
-- When it last entered the queue (a retry puts it back).
alter table public.import_jobs add column if not exists queued_at timestamptz not null default now();

-- Older rows are not checked; every new or changed row is.
alter table public.import_jobs add constraint import_jobs_own_media
  check (input_image_path is null or input_image_path like household_id::text || '/%') not valid;

drop policy if exists import_jobs_all on public.import_jobs;
create policy import_jobs_read on public.import_jobs for select to authenticated
  using (household_id = public.current_household_id());
create policy import_jobs_add on public.import_jobs for insert to authenticated
  with check (household_id = public.current_household_id() and kind <> 'tidy');
create policy import_jobs_retry on public.import_jobs for update to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy import_jobs_remove on public.import_jobs for delete to authenticated
  using (household_id = public.current_household_id());
-- Retrying is the only change the app makes (apps/mobile/src/data/imports.ts REQUEUE).
revoke update on public.import_jobs from authenticated, anon;
grant update (status, error, error_code, stage, stage_at) on public.import_jobs to authenticated;

create or replace function public.import_job_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind <> 'tidy' and (
      select count(*) from public.import_jobs
      where household_id = new.household_id and kind <> 'tidy' and created_at > now() - interval '1 day'
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

drop trigger if exists import_jobs_rules on public.import_jobs;
create trigger import_jobs_rules before insert or update of status on public.import_jobs
  for each row execute function public.import_job_rules();

-- 2. Invites work once -----------------------------------------------------------------------------

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.invites
  where code = upper(trim(p_code)) and expires_at > now()
  returning household_id into v_household;
  if v_household is null then
    raise exception 'invalid or expired code' using errcode = 'P0002';
  end if;
  insert into public.profiles (id, household_id) values (auth.uid(), v_household)
  on conflict (id) do update set household_id = excluded.household_id;
  return v_household;
end;
$$;

-- 3. Nothing waits forever -------------------------------------------------------------------------

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
      where status = 'queued' and kind <> 'tidy' and queued_at < now() - interval '20 minutes'
      returning 1
  )
  select count(*)::int from expired
$$;
revoke execute on function public.expire_stale_jobs() from public, anon, authenticated;

-- Every 5 minutes where pg_cron exists (Supabase); local test databases call it by hand.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('mesa-expire-stale-jobs', '*/5 * * * *', 'select public.expire_stale_jobs()');
  end if;
end
$$;

-- 4. Tidy -------------------------------------------------------------------------------------------

create or replace function public.queue_tidy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'products' then
    if new.household_id is not null and (new.family is null or new.picto is null) then
      insert into public.import_jobs (household_id, kind, subject_id, input_text)
      values (new.household_id, 'tidy', new.id, new.name_en);
    end if;
  elsif new.product_id is null and new.category = 'other' then
    insert into public.import_jobs (household_id, kind, subject_id, input_text)
    values (new.household_id, 'tidy', new.id, new.label);
  end if;
  return new;
end;
$$;
revoke execute on function public.queue_tidy() from public, anon, authenticated;

drop trigger if exists products_tidy on public.products;
create trigger products_tidy after insert on public.products
  for each row execute function public.queue_tidy();
drop trigger if exists grocery_items_tidy on public.grocery_items;
create trigger grocery_items_tidy after insert on public.grocery_items
  for each row execute function public.queue_tidy();

-- 5. Steps in a video -------------------------------------------------------------------------------

alter table public.recipe_steps add column if not exists start_s int check (start_s is null or start_s >= 0);

-- 6. People first: a tidy job only runs when no import or scan is waiting --------------------------

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
        order by (kind = 'tidy'), created_at
        for update skip locked
        limit 1
      )
      returning j.*;
end;
$$;

revoke execute on function public.claim_import_job() from public, anon, authenticated;
grant execute on function public.claim_import_job() to service_role;

-- 7. Off-VPS backups: a private bucket only the service role reaches (infra/vps/backup.sh) -----------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('backups', 'backups', false)
    on conflict (id) do nothing;
  end if;
end
$$;
