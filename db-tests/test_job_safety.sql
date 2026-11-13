-- Jobs the app can't bend, a day's count that never goes down, one recipe per import, rereads that never
-- overwrite an edit, and tidying in batches (migration 27).
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as casa from public.households where name = 'Casa' \gset
select set_config('test.casa', :'casa', false);
delete from public.household_usage where household_id = :'casa';

-- 1. The app queues the input, nothing else -----------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.import_jobs (input_text, status, created_at, attempts, result, error, recipe_id, started_at)
values ('a pasted recipe, already "done"', 'done', now() - interval '3 days', 7, '{"x":1}', 'boom', null, now())
returning set_config('test.job', id::text, false);
do $$
declare j public.import_jobs;
begin
  select * into j from public.import_jobs where id = current_setting('test.job')::uuid;
  assert j.status = 'queued' and j.attempts = 0, 'a new job, whatever the app said';
  assert j.created_at > now() - interval '1 minute', 'not backdated';
  assert j.result is null and j.error is null and j.started_at is null, 'no result, error or start of its own';
end $$;

-- Each job a person queues takes one of the day's 60, and deleting it gives nothing back.
reset role;
do $$ begin
  assert public.people_jobs_today(current_setting('test.casa')::uuid) = 1, 'one job counted';
end $$;
set role authenticated;
delete from public.import_jobs where id = current_setting('test.job')::uuid;
reset role;
do $$ begin
  assert public.people_jobs_today(current_setting('test.casa')::uuid) = 1, 'still one after deleting it';
end $$;

-- A person spends only their own kitchen's count.
set role authenticated;
do $$ begin
  begin
    perform public.take_job_slot('11111111-1111-1111-1111-111111111111');
    assert false, 'a person spent another kitchen''s jobs';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. Try again: a failed job back in the queue, and nothing else ------------------------------------------

reset role;
insert into public.import_jobs (id, household_id, kind, input_text, status, created_by, attempts) values
  ('d1000000-0000-0000-0000-000000000001', :'casa', 'recipe', 'done one', 'done', '00000000-0000-0000-0000-00000000000a', 1),
  ('d1000000-0000-0000-0000-000000000002', :'casa', 'recipe', 'running one', 'processing', '00000000-0000-0000-0000-00000000000a', 1),
  ('d1000000-0000-0000-0000-000000000003', :'casa', 'recipe', 'failed one', 'failed', '00000000-0000-0000-0000-00000000000b', 2),
  ('d1000000-0000-0000-0000-000000000004', :'casa', 'tidy', 'failed tidy', 'failed', null, 1);
update public.import_jobs set error = 'Couldn''t open this link.', error_code = 'pageFailed', finished_at = now()
  where id = 'd1000000-0000-0000-0000-000000000003';
select set_config('test.before', public.people_jobs_today(:'casa')::text, false);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    update public.import_jobs set status = 'queued' where id = 'd1000000-0000-0000-0000-000000000001';
    assert false, 'a done job was run again';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.import_jobs set status = 'queued' where id = 'd1000000-0000-0000-0000-000000000002';
    assert false, 'a running job was handed out twice';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.import_jobs set status = 'queued' where id = 'd1000000-0000-0000-0000-000000000004';
    assert false, 'the server''s background work was run again by a person';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.import_jobs set error = 'anything' where id = 'd1000000-0000-0000-0000-000000000003';
    assert false, 'a person rewrote a job''s error';
  exception when insufficient_privilege then null;
  end;
  -- Someone else's failed job of the kitchen, tried again (imports.ts REQUEUE).
  update public.import_jobs set status = 'queued', error = null, error_code = null, stage = null, stage_at = null
    where id = 'd1000000-0000-0000-0000-000000000003';
end $$;
reset role;
do $$
declare j public.import_jobs;
begin
  select * into j from public.import_jobs where id = 'd1000000-0000-0000-0000-000000000003';
  assert j.status = 'queued' and j.error is null and j.error_code is null and j.finished_at is null, 'back in the queue, clean';
  assert j.attempts = 2, 'attempts never go back (they fence the runs)';
  assert j.queued_at > now() - interval '1 minute', 'a fresh clock';
end $$;
do $$ begin
  assert public.people_jobs_today(current_setting('test.casa')::uuid) = current_setting('test.before')::int + 1, 'Try again took one of the day''s jobs';
end $$;
update public.import_jobs set status = 'done' where id::text like 'd1000000-%';

-- Signed-out visitors can't even read jobs.
set role anon;
do $$ begin
  begin
    perform 1 from public.import_jobs limit 1;
    assert false, 'anon read jobs';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3. One recipe per import -----------------------------------------------------------------------------------

insert into public.import_jobs (id, household_id, kind, input_url, status, created_by, attempts) values
  ('d2000000-0000-0000-0000-000000000001', :'casa', 'recipe', 'https://example.com/chow-mein', 'processing', '00000000-0000-0000-0000-00000000000a', 2);

set role service_role;
select public.save_imported_recipe(
  'd2000000-0000-0000-0000-000000000001', 2,
  '{"title": "Chow mein", "servings": 2, "source_url": "https://example.com/chow-mein", "source_platform": "web", "original": {"language": "en"}}',
  '[{"position": 0, "raw_text": "dark soy sauce 1 tsp", "name": "dark soy sauce", "quantity": 1, "unit": "tsp", "section": "Marinade"},
    {"position": 1, "raw_text": "dark soy sauce 2 tbsp", "name": "dark soy sauce", "quantity": 2, "unit": "tbsp", "section": "Sauce"}]',
  '[{"position": 0, "text": "Marinate the beef."}, {"position": 1, "text": "Toss the noodles.", "start_s": 42}]'
) as saved \gset
select public.save_imported_recipe('d2000000-0000-0000-0000-000000000001', 2, '{"title": "Again"}', '[]', '[]') as again \gset
select set_config('test.saved', :'saved', false);
select set_config('test.again', :'again', false);
do $$
declare r public.recipes;
begin
  assert current_setting('test.again') = current_setting('test.saved'), 'the same job gets its recipe back';
  select * into r from public.recipes where id = current_setting('test.saved')::uuid;
  assert r.household_id = current_setting('test.casa')::uuid and r.import_job_id = 'd2000000-0000-0000-0000-000000000001', 'the job''s kitchen, the job';
  assert r.title = 'Chow mein' and r.servings = 2 and r.original->>'language' = 'en', 'as read';
  assert (select count(*) from public.recipes where import_job_id = 'd2000000-0000-0000-0000-000000000001') = 1, 'one recipe';
  assert (select string_agg(section, ',' order by position) from public.recipe_ingredients where recipe_id = r.id) = 'Marinade,Sauce', 'lines with their sections';
  assert (select start_s from public.recipe_steps where recipe_id = r.id and position = 1) = 42, 'steps with their start';
end $$;
-- A run the queue gave up on (another attempt holds the job, or it ended) writes nothing.
do $$ begin
  begin
    perform public.save_imported_recipe('d2000000-0000-0000-0000-000000000001', 1, '{"title": "Stale"}', '[]', '[]');
    assert false, 'an older attempt wrote a recipe';
  exception when sqlstate 'P0004' then null;
  end;
end $$;
reset role;
update public.import_jobs set status = 'done' where id = 'd2000000-0000-0000-0000-000000000001';
set role service_role;
do $$ begin
  begin
    perform public.save_imported_recipe('d2000000-0000-0000-0000-000000000001', 2, '{"title": "Late"}', '[]', '[]');
    assert false, 'a finished job wrote a recipe';
  exception when sqlstate 'P0004' then null;
  end;
end $$;
reset role;
-- A failed write leaves nothing behind (one transaction).
insert into public.import_jobs (id, household_id, kind, input_text, status, created_by, attempts) values
  ('d2000000-0000-0000-0000-000000000002', :'casa', 'recipe', 'text', 'processing', '00000000-0000-0000-0000-00000000000a', 1);
set role service_role;
do $$ begin
  begin
    perform public.save_imported_recipe('d2000000-0000-0000-0000-000000000002', 1, '{"title": "Half written"}',
      '[{"position": 0, "raw_text": "x", "name": "x", "quantity": -1}]', '[]');
    assert false, 'a negative amount was written';
  exception when check_violation then null;
  end;
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.recipes where title = 'Half written'), 'no recipe without its lines';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    perform public.save_imported_recipe('d2000000-0000-0000-0000-000000000002', 1, '{"title": "From the app"}', '[]', '[]');
    assert false, 'the app wrote an import';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- 4. Redo ingredients never overwrites an edit ------------------------------------------------------------

insert into public.recipes (id, household_id, title, source_platform) values ('d3000000-0000-0000-0000-000000000001', :'casa', 'Reread me', 'web');
insert into public.recipe_ingredients (id, recipe_id, position, raw_text, name, section) values
  ('d3100000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 0, 'Other 1 tbsp', 'Other', 'Sauce'),
  ('d3100000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001', 1, '2 eggs', 'egg', null);
select updated_at as read_at from public.recipes where id = 'd3000000-0000-0000-0000-000000000001' \gset
-- The person edits a line while the worker reads.
update public.recipe_ingredients set raw_text = '3 eggs', quantity = 3 where id = 'd3100000-0000-0000-0000-000000000002';
set role service_role;
select public.apply_reread('d3000000-0000-0000-0000-000000000001', :'read_at',
  '[{"id": "d3100000-0000-0000-0000-000000000001", "position": 0, "name": "dark soy sauce", "quantity": 1, "unit": "tbsp"},
    {"id": "d3100000-0000-0000-0000-000000000002", "position": 1, "name": "egg", "quantity": 2}]') as stale_write \gset
reset role;
select set_config('test.stale_write', :'stale_write', false);
do $$ begin
  assert current_setting('test.stale_write') = 'f', 'the recipe changed: nothing written';
  assert (select quantity from public.recipe_ingredients where id = 'd3100000-0000-0000-0000-000000000002') = 3, 'the edit stays';
  assert (select name from public.recipe_ingredients where id = 'd3100000-0000-0000-0000-000000000001') = 'Other', 'no line rewritten';
end $$;
select updated_at as read_again from public.recipes where id = 'd3000000-0000-0000-0000-000000000001' \gset
set role service_role;
select public.apply_reread('d3000000-0000-0000-0000-000000000001', :'read_again',
  '[{"id": "d3100000-0000-0000-0000-000000000001", "position": 0, "name": "dark soy sauce", "quantity": 1, "unit": "tbsp", "section": "Not mine"}]') as fresh_write \gset
reset role;
select set_config('test.fresh_write', :'fresh_write', false);
do $$ begin
  assert current_setting('test.fresh_write') = 't', 'read as it is: written';
  assert (select name || ' ' || section from public.recipe_ingredients where id = 'd3100000-0000-0000-0000-000000000001') = 'dark soy sauce Sauce',
    'the line read again, its section the person''s';
  assert (select raw_text from public.recipe_ingredients where id = 'd3100000-0000-0000-0000-000000000001') = 'Other 1 tbsp', 'its text as stored';
end $$;

-- 5. Tidying in batches ------------------------------------------------------------------------------------

insert into public.households (id, name) values ('d4000000-0000-0000-0000-000000000001', 'Tidy batch');
insert into public.products (household_id, name_en) values
  ('d4000000-0000-0000-0000-000000000001', 'Huitlacoche'),
  ('d4000000-0000-0000-0000-000000000001', 'Epazote');
insert into public.grocery_items (household_id, label, category) values ('d4000000-0000-0000-0000-000000000001', 'Flor de calabaza', 'other');
do $$ begin
  assert (select count(*) from public.import_jobs where household_id = 'd4000000-0000-0000-0000-000000000001' and kind = 'tidy') = 1,
    'two products and a list line: one tidy waits';
end $$;
-- While it runs, something new gets the next one.
update public.import_jobs set status = 'processing' where household_id = 'd4000000-0000-0000-0000-000000000001' and kind = 'tidy';
insert into public.products (household_id, name_en) values ('d4000000-0000-0000-0000-000000000001', 'Chepil');
do $$ begin
  assert (select count(*) from public.import_jobs where household_id = 'd4000000-0000-0000-0000-000000000001' and kind = 'tidy' and status = 'queued') = 1,
    'one more waits for what came in during the run';
end $$;
update public.import_jobs set status = 'done' where household_id = 'd4000000-0000-0000-0000-000000000001';

select 'JOB SAFETY TESTS PASSED' as result;
