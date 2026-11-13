-- Mesa — honest import feedback (expert panel 2, lot A).
-- The worker writes what it is doing (stage) and what it already knows (preview title, thumbnail), so
-- the app can show a real progression. A failure carries a code, so the app offers the right way out.
-- Jobs and push tokens remember their person: progress, "ready" and pushes go to whoever shared.

alter table public.import_jobs
  add column stage text check (stage in ('opening', 'downloading', 'watching', 'reading', 'writing')),
  add column stage_at timestamptz,
  add column preview_title text,
  add column preview_image_url text,
  add column error_code text,
  add column created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column already_saved boolean not null default false;

create index import_jobs_created_by on public.import_jobs (created_by, created_at desc);

alter table public.push_tokens
  add column user_id uuid references auth.users(id) on delete cascade;

-- A device's token belongs to whoever is signed in on it now (household and person).
create or replace function public.register_push_token(p_token text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
begin
  if v_household is null or p_token is null or length(trim(p_token)) = 0 then
    return;
  end if;
  insert into public.push_tokens (token, household_id, user_id)
  values (trim(p_token), v_household, auth.uid())
  on conflict (token) do update
    set household_id = excluded.household_id, user_id = excluded.user_id, created_at = now();
end;
$$;

-- Claiming starts the stage clock ("Opening the post"); jobs a crashed worker left behind go back
-- to the queue without a stale stage, or fail with the same readable message as a worker timeout.
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
        order by created_at
        for update skip locked
        limit 1
      )
      returning j.*;
end;
$$;

revoke execute on function public.claim_import_job() from public, anon, authenticated;
grant execute on function public.claim_import_job() to service_role;
revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
