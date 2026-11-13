-- One registry of job kinds, server work that never competes with people, and a fair claim (migration 24).
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
-- Start from an empty queue.
update public.import_jobs set status = 'done' where status in ('queued', 'processing');

insert into public.households (id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'Fair one'),
  ('a1000000-0000-0000-0000-000000000002', 'Fair two'),
  ('a1000000-0000-0000-0000-000000000003', 'Fair three');

-- 1. The registry ------------------------------------------------------------------------------------

do $$ begin
  assert (select count(*) from public.job_kinds) = 13, 'thirteen kinds';
  assert not exists (select 1 from public.job_kinds where kind = 'adapt'), 'adapt is gone';
  assert public.is_background_kind('tidy') and public.is_background_kind('follow_check') and public.is_background_kind('for_you'), 'background kinds';
  assert not public.is_background_kind('recipe') and not public.is_background_kind('nope'), 'not background';
  assert public.is_quick_kind('ask') and public.is_quick_kind('reread') and not public.is_quick_kind('find') and not public.is_quick_kind('nope'), 'quick kinds';
  begin
    insert into public.import_jobs (household_id, kind, input_text) values ('a1000000-0000-0000-0000-000000000001', 'adapt', 'no cream');
    assert false, 'a kind outside the registry was queued';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.job_kinds (kind, lane, counts_toward_quota, expires_in_queue) values ('chore', 'background', true, false);
    assert false, 'background work counted toward a quota';
  exception when check_violation then null;
  end;
end $$;

-- The app reads the kinds and never changes them.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.job_kinds) = 13, 'the app reads the kinds';
  begin
    update public.job_kinds set lane = 'quick' where kind = 'recipe';
    assert false, 'the app changed a kind';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. The app queues only in its person's name ---------------------------------------------------------

do $$ begin
  begin
    insert into public.import_jobs (kind, input_text, created_by) values ('recipe', 'a pasted recipe', null);
    assert false, 'the app queued a job as the server (no quota)';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.import_jobs (kind, input_text, created_by) values ('recipe', 'a pasted recipe', '00000000-0000-0000-0000-00000000000b');
    assert false, 'the app queued a job in someone else''s name';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.import_jobs (kind, input_text) values ('recipe', 'a pasted recipe')
  returning set_config('test.mine', created_by::text, false);
do $$ begin
  assert current_setting('test.mine') = current_setting('request.jwt.claim.sub'), 'the job is the person''s by default';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.import_jobs set status = 'done' where status = 'queued';

-- 3. The quota counts people's jobs only ---------------------------------------------------------------

-- Fair one: 59 jobs people queued today, 100 the server queued (rereads), tidying, and older days.
insert into public.import_jobs (household_id, kind, input_text, status, created_by)
select 'a1000000-0000-0000-0000-000000000001', 'recipe', 'import ' || g, 'done', '00000000-0000-0000-0000-00000000000a' from generate_series(1, 59) g;
insert into public.import_jobs (household_id, kind, input_text, status, created_by)
select 'a1000000-0000-0000-0000-000000000001', 'reread', 'reread ' || g, 'done', null from generate_series(1, 100) g;
insert into public.import_jobs (household_id, kind, input_text, status, created_by)
select 'a1000000-0000-0000-0000-000000000001', 'tidy', 'tidy ' || g, 'done', '00000000-0000-0000-0000-00000000000a' from generate_series(1, 5) g;
insert into public.import_jobs (household_id, kind, input_text, status, created_by, created_at)
select 'a1000000-0000-0000-0000-000000000001', 'recipe', 'old ' || g, 'done', '00000000-0000-0000-0000-00000000000a', now() - interval '2 days' from generate_series(1, 5) g;
do $$ begin
  assert public.people_jobs_today('a1000000-0000-0000-0000-000000000001') = 59, 'the server''s jobs, tidying and older days don''t count';
  insert into public.import_jobs (household_id, kind, input_text, status, created_by)
    values ('a1000000-0000-0000-0000-000000000001', 'ask', 'the 60th', 'done', '00000000-0000-0000-0000-00000000000a');
  begin
    insert into public.import_jobs (household_id, kind, input_text, created_by)
      values ('a1000000-0000-0000-0000-000000000001', 'recipe', 'the 61st', '00000000-0000-0000-0000-00000000000a');
    assert false, 'a person''s 61st job of the day was accepted';
  exception when sqlstate 'P0001' then null;
  end;
  -- The server still queues its work for the household: it never takes the people's share.
  insert into public.import_jobs (household_id, kind, input_text, status, created_by)
    values ('a1000000-0000-0000-0000-000000000001', 'reread', 'one more', 'done', null);
  assert public.people_jobs_today('a1000000-0000-0000-0000-000000000001') = 60, 'the server''s job counted for nothing';
end $$;

-- 4. Only people's jobs expire in the queue ------------------------------------------------------------

insert into public.import_jobs (id, household_id, kind, input_text, created_by) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'recipe', 'a person''s', '00000000-0000-0000-0000-00000000000a'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'reread', 'the server''s', null),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'for_you', 'weekly', null);
update public.import_jobs set queued_at = now() - interval '21 minutes' where id::text like 'a2000000-%';
select public.expire_stale_jobs() as expired \gset
do $$ begin
  assert (select status = 'failed' and error_code = 'aiBusy' from public.import_jobs where id = 'a2000000-0000-0000-0000-000000000001'), 'a person''s job fails after 20 minutes';
  assert (select status from public.import_jobs where id = 'a2000000-0000-0000-0000-000000000002') = 'queued', 'the server''s reread waits its turn';
  assert (select status from public.import_jobs where id = 'a2000000-0000-0000-0000-000000000003') = 'queued', 'background work waits';
end $$;
update public.import_jobs set status = 'done' where status in ('queued', 'processing');
-- A fresh day for our households (the count itself only the server resets: migration 27).
delete from public.import_jobs where household_id::text like 'a1000000-%';
delete from public.household_usage where household_id::text like 'a1000000-%';

-- 5. A fair claim ----------------------------------------------------------------------------------------

-- Fair one was served an hour ago, Fair two two hours ago, Fair three never.
insert into public.import_jobs (household_id, kind, input_text, status, created_by, started_at) values
  ('a1000000-0000-0000-0000-000000000001', 'recipe', 'served', 'done', '00000000-0000-0000-0000-00000000000a', now() - interval '1 hour'),
  ('a1000000-0000-0000-0000-000000000002', 'recipe', 'served', 'done', '00000000-0000-0000-0000-00000000000a', now() - interval '2 hours');
-- Fair one's jobs waited longest; every household has two.
insert into public.import_jobs (id, household_id, kind, input_text, created_by, created_at)
select ('a3000000-0000-0000-0000-0000000000' || h || n)::uuid, ('a1000000-0000-0000-0000-00000000000' || h)::uuid, 'recipe', 'import', '00000000-0000-0000-0000-00000000000a',
       now() - make_interval(mins => 30 - h * 10 - n)
from generate_series(1, 3) h, generate_series(1, 2) n;

set role service_role;
-- One claim per statement, as the worker's slots do (each its own moment).
select set_config('test.first', household_id::text, false) from public.claim_import_job('any');
select set_config('test.second', household_id::text, false) from public.claim_import_job('any');
select set_config('test.third', household_id::text, false) from public.claim_import_job('any');
do $$ begin
  assert current_setting('test.first') = 'a1000000-0000-0000-0000-000000000003', 'the household never served goes first, not the oldest job';
  assert current_setting('test.second') = 'a1000000-0000-0000-0000-000000000002', 'then the one served longest ago';
  assert current_setting('test.third') = 'a1000000-0000-0000-0000-000000000001', 'then the last one served';
  assert (select count(*) from public.claim_import_job('any')) = 0, 'one job per household at a time in the any lane';
  assert (select count(*) from public.import_jobs where status = 'processing' and claimed_lane = 'any') = 3, 'the lane is on the job';
end $$;
-- All three finish: the turns go on in the same order.
update public.import_jobs set status = 'done' where status = 'processing';
select set_config('test.first', household_id::text, false) from public.claim_import_job('any');
do $$ begin
  assert current_setting('test.first') = 'a1000000-0000-0000-0000-000000000003', 'round robin: the household served longest ago';
end $$;
reset role;
update public.import_jobs set status = 'done' where status in ('queued', 'processing');

-- Server work never holds a person's job back; it waits for whatever the household runs.
insert into public.import_jobs (id, household_id, kind, input_text, created_by, created_at) values
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'reread', 'the server''s', null, now() - interval '9 minutes'),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'tidy', 'tidy', null, now() - interval '8 minutes'),
  ('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'recipe', 'a person''s', '00000000-0000-0000-0000-00000000000a', now());
set role service_role;
do $$
declare j public.import_jobs;
begin
  select * into j from public.claim_import_job('any');
  assert j.id = 'a4000000-0000-0000-0000-000000000003', 'a person''s job before the server''s older work';
  select * into j from public.claim_import_job('any');
  assert j.id = 'a4000000-0000-0000-0000-000000000001', 'then the server''s reread';
  assert (select count(*) from public.claim_import_job('any')) = 0, 'tidying waits while its household runs a job';
end $$;
reset role;
insert into public.import_jobs (id, household_id, kind, input_text, created_by) values
  ('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'recipe', 'a person''s', '00000000-0000-0000-0000-00000000000b');
set role service_role;
do $$
declare j public.import_jobs;
begin
  select * into j from public.claim_import_job('any');
  assert j.id = 'a4000000-0000-0000-0000-000000000004', 'a person''s job never waits for the household''s server work';
end $$;

-- The quick lane: people's quick jobs of any household, never the server's; no turn to wait in the any lane.
reset role;
insert into public.import_jobs (id, household_id, kind, input_text, created_by, created_at) values
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'reread', 'the server''s', null, now() - interval '5 minutes'),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'ask', 'rice?', '00000000-0000-0000-0000-00000000000a', now() - interval '1 minute');
set role service_role;
do $$
declare j public.import_jobs;
begin
  select * into j from public.claim_import_job('quick');
  assert j.id = 'a5000000-0000-0000-0000-000000000002' and j.claimed_lane = 'quick', 'a person''s question, though its household runs jobs';
  assert (select count(*) from public.claim_import_job('quick')) = 0, 'never the server''s reread';
end $$;

reset role;
update public.import_jobs set status = 'done' where status in ('queued', 'processing');
delete from public.import_jobs where household_id::text like 'a1000000-%';
delete from public.households where id::text like 'a1000000-%';
select 'JOB KINDS TESTS PASSED' as result;
