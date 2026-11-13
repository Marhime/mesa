-- Several screenshots, ideas and translations people ask for, crash reports.
\set ON_ERROR_STOP on

reset role;
select id as household from public.households where name = 'Casa' \gset
select set_config('test.household', :'household', false);
-- the day's import quota was used up by test_safety: start a fresh day for this household (deleting jobs
-- gives no quota back since migration 27: the day's count is reset here, as only the server can)
delete from public.import_jobs where household_id = :'household' and kind <> 'tidy';
delete from public.household_usage where household_id = :'household';

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare h text := current_setting('test.household');
begin
  insert into public.import_jobs (input_image_path, input_image_paths)
  values (h || '/a.jpg', array[h || '/a.jpg', h || '/b.jpg']);
  begin
    insert into public.import_jobs (input_image_path, input_image_paths)
    values (h || '/a.jpg', array[h || '/a.jpg', '11111111-1111-1111-1111-111111111111/theirs.jpg']);
    assert false, 'a screenshot of another household was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.import_jobs (input_image_path, input_image_paths)
    values (h || '/a.jpg', array[h || '/1', h || '/2', h || '/3', h || '/4', h || '/5', h || '/6', h || '/7']);
    assert false, 'seven screenshots accepted';
  exception when check_violation then null;
  end;
  -- People can ask for ideas and translations
  insert into public.import_jobs (kind, subject_id, input_text) values ('idea', gen_random_uuid(), 'Tomato');
  insert into public.import_jobs (kind, subject_id, input_text) values ('translate', '20000000-0000-0000-0000-000000000001', 'en');
end $$;

-- Translations are written by the worker, read by the household only
do $$ begin
  begin
    insert into public.recipe_translations (recipe_id, lang, title, steps) values ('20000000-0000-0000-0000-000000000001', 'en', 'Tinga', '[]');
    assert false, 'the app wrote a translation';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
insert into public.recipe_translations (recipe_id, lang, title, steps)
values ('20000000-0000-0000-0000-000000000001', 'en', 'Chicken tinga', '["Shred the chicken."]');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select title from public.recipe_translations where recipe_id = '20000000-0000-0000-0000-000000000001' and lang = 'en') = 'Chicken tinga',
    'the household reads its translation';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.recipe_translations) = 0, 'a stranger reads none';
end $$;

-- A phone reports a crash; nobody reads reports from the app
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.client_errors (message, stack, context) values ('TypeError: x is undefined', 'at Pantry', '{"screen": "pantry"}');
do $$ begin
  begin
    perform count(*) from public.client_errors;
    assert false, 'the app read crash reports';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.client_errors where message like 'TypeError%') = 1, 'report kept';
end $$;

select 'AI TESTS PASSED' as result;
