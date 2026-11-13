-- Ask Mesa, fast (Nov 2026): a question never waits behind an import, and its answer shows as it is written.
--   is_quick_kind(): what a person waits for in a conversation (ask). The worker keeps a slot that claims
--     only those (claim_import_job('quick')); every other slot takes them first too.
--   import_jobs.draft: the answer's words so far while the worker writes them (the worker's only; cleared
--     once the job is done or failed, when `result` / `error` say the rest).

create or replace function public.is_quick_kind(p_kind text)
returns boolean
language sql
immutable
as $$
  select p_kind in ('ask')
$$;

alter table public.import_jobs add column if not exists draft text;
alter table public.import_jobs drop constraint if exists import_jobs_draft_size;
alter table public.import_jobs add constraint import_jobs_draft_size check (draft is null or length(draft) <= 4000);

-- The lane is new: the no-argument version goes (a call without arguments still lands on 'any').
drop function if exists public.claim_import_job();
create or replace function public.claim_import_job(p_lane text default 'any')
returns setof public.import_jobs
language plpgsql
set search_path = public
as $$
begin
  if p_lane is null or p_lane not in ('any', 'quick') then
    raise exception 'unknown lane: %', p_lane using errcode = '22023';
  end if;

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

  return query
    update public.import_jobs j
      set status = 'processing', started_at = now(), attempts = j.attempts + 1, stage = 'opening', stage_at = now(), draft = null
      where j.id = (
        select id from public.import_jobs
        where status = 'queued' and (p_lane = 'any' or public.is_quick_kind(kind))
        -- People's quick questions first, then people's other jobs, background work last.
        order by public.is_background_kind(kind), not public.is_quick_kind(kind), created_at
        for update skip locked
        limit 1
      )
      returning j.*;
end;
$$;
revoke execute on function public.claim_import_job(text) from public, anon, authenticated;
grant execute on function public.claim_import_job(text) to service_role;
