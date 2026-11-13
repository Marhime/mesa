-- Ask Mesa, fast: a quick lane for questions, quick kinds first in every lane, and the answer's draft.
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as household from public.households where name = 'Casa' \gset
-- Start from an empty queue.
update public.import_jobs set status = 'done' where status in ('queued', 'processing');

do $$ begin
  assert public.is_quick_kind('ask') and not public.is_quick_kind('recipe') and not public.is_quick_kind('tidy'), 'quick kinds';
end $$;

-- Marhime's jobs (created_by), and the server's tidying (none).
insert into public.import_jobs (id, household_id, kind, input_text, created_at, created_by) values
  ('50000000-0000-0000-0000-000000000001', :'household', 'tidy', 'tidy', now() - interval '3 minutes', null),
  ('50000000-0000-0000-0000-000000000002', :'household', 'recipe', 'a pasted recipe', now() - interval '2 minutes', '00000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-000000000003', :'household', 'ask', 'do we have rice?', now() - interval '1 minute', '00000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-000000000004', :'household', 'ask', 'and pasta?', now(), '00000000-0000-0000-0000-00000000000a');
-- Left over from a worker that died mid-answer: the claim clears it.
update public.import_jobs set draft = 'Yes, there is' where id = '50000000-0000-0000-0000-000000000003';

set role service_role;
do $$
declare j public.import_jobs;
begin
  -- The quick lane: questions only, oldest first, with a clean draft.
  select * into j from public.claim_import_job('quick');
  assert j.id = '50000000-0000-0000-0000-000000000003', 'quick lane takes the oldest question';
  assert j.status = 'processing' and j.stage = 'opening' and j.attempts = 1, 'claimed';
  assert j.draft is null, 'draft cleared on claim';
  -- Any lane: a question before an older import, background work last.
  select * into j from public.claim_import_job('any');
  assert j.id = '50000000-0000-0000-0000-000000000004', 'a question goes before an older import';
  assert (select count(*) from public.claim_import_job('quick')) = 0, 'quick lane never takes an import or tidying';
  -- One job per household in the any lane (test_job_kinds.sql): the import waits for the question.
  assert (select count(*) from public.claim_import_job('any')) = 0, 'the household runs a job in the any lane';
  update public.import_jobs set status = 'done' where id = '50000000-0000-0000-0000-000000000004';
  -- Without a lane (an older worker): any.
  select * into j from public.claim_import_job();
  assert j.id = '50000000-0000-0000-0000-000000000002', 'then the import';
  assert (select count(*) from public.claim_import_job()) = 0, 'server work waits while the household runs a job';
  update public.import_jobs set status = 'done' where id = '50000000-0000-0000-0000-000000000002';
  select * into j from public.claim_import_job();
  assert j.id = '50000000-0000-0000-0000-000000000001', 'background work last';
  assert (select count(*) from public.claim_import_job()) = 0, 'queue empty';
end $$;

-- An unknown lane is refused.
do $$ begin
  begin
    perform public.claim_import_job('slow');
    assert false, 'unknown lane accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.claim_import_job(null);
    assert false, 'null lane accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- A question a crashed worker left behind goes back to the queue without its half-written answer.
reset role;
update public.import_jobs set started_at = now() - interval '11 minutes', draft = 'Half an ans'
  where id = '50000000-0000-0000-0000-000000000003';
update public.import_jobs set status = 'processing', started_at = now() - interval '11 minutes', attempts = 3, draft = 'Half'
  where id = '50000000-0000-0000-0000-000000000004';
set role service_role;
do $$
declare j public.import_jobs;
begin
  select * into j from public.claim_import_job('quick');
  assert j.id = '50000000-0000-0000-0000-000000000003' and j.attempts = 2 and j.draft is null, 'requeued and claimed again, draft cleared';
  assert (select status from public.import_jobs where id = '50000000-0000-0000-0000-000000000004') = 'failed', 'gave up after 3 tries';
  assert (select draft from public.import_jobs where id = '50000000-0000-0000-0000-000000000004') is null, 'draft cleared on give-up';
end $$;

-- The worker writes the draft, within its size.
update public.import_jobs set draft = 'Yes, there is rice' where id = '50000000-0000-0000-0000-000000000003';
do $$ begin
  begin
    update public.import_jobs set draft = repeat('a', 4001) where id = '50000000-0000-0000-0000-000000000003';
    assert false, 'oversized draft accepted';
  exception when check_violation then null;
  end;
end $$;

-- The app reads the draft but cannot write it, nor claim jobs in any lane.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select draft from public.import_jobs where id = '50000000-0000-0000-0000-000000000003') = 'Yes, there is rice', 'the household sees the draft';
  begin
    update public.import_jobs set draft = 'forged' where id = '50000000-0000-0000-0000-000000000003';
    assert false, 'the app wrote a draft';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_import_job('quick');
    assert false, 'the app claimed a question';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.import_jobs where id = '50000000-0000-0000-0000-000000000003') = 0, 'a stranger sees no draft';
end $$;

reset role;
select 'FAST LANE TESTS PASSED' as result;
