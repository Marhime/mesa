-- Safety rules (own files only, inputs not rewritable, one-time invites, quotas, nothing waits forever)
-- and tidy jobs for things Mesa doesn't know.
\set ON_ERROR_STOP on

reset role;
select id as household from public.households where name = 'Casa' \gset
select set_config('test.household', :'household', false);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    insert into public.import_jobs (input_image_path) values ('11111111-1111-1111-1111-111111111111/theirs.jpg');
    assert false, 'a job pointing to another household''s file was accepted';
  exception when check_violation then null;
  end;
  insert into public.import_jobs (input_image_path) values (current_setting('test.household') || '/ours.jpg');
  begin
    insert into public.import_jobs (kind, input_text) values ('tidy', 'anything');
    assert false, 'the app queued a tidy job';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.import_jobs set input_image_path = '11111111-1111-1111-1111-111111111111/theirs.jpg'
    where input_image_path like '%/ours.jpg';
    assert false, 'the app rewrote a job''s input';
  exception when insufficient_privilege then null;
  end;
  -- Try again (imports.ts REQUEUE) is for failed jobs only (migration 27): this one is still queued.
  begin
    update public.import_jobs set status = 'queued', error = null, error_code = null, stage = null, stage_at = null
    where input_image_path like '%/ours.jpg';
    assert false, 'a job that had not failed was put back in the queue';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A job stuck in the queue for 20 minutes fails with a way out
reset role;
update public.import_jobs set queued_at = now() - interval '21 minutes' where input_image_path like '%/ours.jpg';
select public.expire_stale_jobs() as expired \gset
do $$ begin
  assert (select status from public.import_jobs where input_image_path like '%/ours.jpg') = 'failed', 'stale job failed';
  assert (select error_code from public.import_jobs where input_image_path like '%/ours.jpg') = 'aiBusy', 'with Try again';
end $$;
-- ...and Try again puts it back in the queue with a fresh clock
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.import_jobs set status = 'queued', error = null, error_code = null where input_image_path like '%/ours.jpg';
do $$ begin
  assert (select queued_at > now() - interval '1 minute' from public.import_jobs where input_image_path like '%/ours.jpg'), 'retry restarts the clock';
end $$;

-- Things Mesa doesn't know get tidied: a list line typed by hand, a product the household creates
select public.add_grocery_item('Flor de jamaica', null, null, null, 'other', 'manual') as jamaica \gset
select public.ensure_product('Huauzontle', 'produce') as huauzontle \gset
reset role;
select set_config('test.jamaica', (:'jamaica'::public.grocery_items).id::text, false);
select set_config('test.huauzontle', :'huauzontle', false);
-- One tidy waits for the household and takes both when it runs (migration 27).
do $$ begin
  assert (select count(*) from public.import_jobs
          where kind = 'tidy' and status = 'queued' and household_id = current_setting('test.household')::uuid) = 1,
         'one tidy waits for the line and the product';
end $$;

-- Recipe steps can start at a second of the video, never a negative one
do $$ begin
  begin
    insert into public.recipe_steps (recipe_id, position, text, start_s) values ('20000000-0000-0000-0000-000000000001', 99, 'Stir', -1);
    assert false, 'negative start accepted';
  exception when check_violation then null;
  end;
end $$;

-- An invite works once
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.create_invite() as code \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.join_household(:'code');
select set_config('test.code', :'code', false);
do $$ begin
  assert public.join_household(current_setting('test.code')) is null, 'the same code worked twice';
end $$;

-- At most 60 imports a day per household (jobs people queued; see test_job_kinds.sql for the server's)
reset role;
insert into public.import_jobs (household_id, input_url, status, created_by)
select :'household', 'https://example.com/' || g, 'done', '00000000-0000-0000-0000-00000000000a'
from generate_series(1, 60 - public.people_jobs_today(:'household')) g;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    insert into public.import_jobs (input_url) values ('https://example.com/one-more');
    assert false, 'the 61st import of the day was accepted';
  exception when sqlstate 'P0001' then null;
  end;
end $$;
-- Deleting the day's jobs gives nothing back (migration 27: the count never goes down).
delete from public.import_jobs where input_url like 'https://example.com/%';
do $$ begin
  begin
    insert into public.import_jobs (input_url) values ('https://example.com/after-deleting');
    assert false, 'deleting jobs gave the quota back';
  exception when sqlstate 'P0001' then null;
  end;
end $$;

reset role;
select 'SAFETY TESTS PASSED' as result;
