-- Heading lines read like the app reads them, heading lines saved as ingredients turned into sections, and
-- rereads that give a recipe its parts once (migration 29).
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as casa from public.households where name = 'Casa' \gset

-- 1. heading_of reads what sectionHeading reads (packages/shared/test/sections.test.ts) ------------------------

do $$ begin
  assert public.heading_of('For the sauce:') = 'For the sauce', 'colon';
  assert public.heading_of('  ## Marinade :  ') = 'Marinade', 'markdown with a colon';
  assert public.heading_of('[Marinade]') = 'Marinade', 'brackets';
  assert public.heading_of('## Sauce') = 'Sauce', 'markdown';
  assert public.heading_of('**For the noodles**') = 'For the noodles', 'bold';
  assert public.heading_of('— To serve —') = 'To serve', 'dashes';
  assert public.heading_of('{Garnish}') = 'Garnish', 'braces';
  assert public.heading_of('Salsa：') = 'Salsa', 'full-width colon';
  assert public.heading_of('[1 cup]') is null, 'an amount in brackets is no part';
  assert public.heading_of('Salt: to taste') is null, 'a line with a colon inside';
  assert public.heading_of('2:') is null, 'no letter';
  assert public.heading_of('- 2 eggs') is null, 'a bullet';
  assert public.heading_of('beef 7 oz/200 g') is null, 'an ingredient';
end $$;

-- 2. Heading lines saved as ingredients become sections --------------------------------------------------------

insert into public.recipes (id, household_id, title, source_platform) values
  ('f1000000-0000-0000-0000-000000000001', :'casa', 'Chow mein as typed', 'instagram'),
  ('f1000000-0000-0000-0000-000000000002', :'casa', 'Twelve lines, no parts', 'web'),
  ('f1000000-0000-0000-0000-000000000003', :'casa', 'Three lines', 'web');
insert into public.recipe_ingredients (recipe_id, position, raw_text, name) values
  ('f1000000-0000-0000-0000-000000000001', 0, 'salt', 'salt'),
  ('f1000000-0000-0000-0000-000000000001', 1, '[Marinade]', '[Marinade]'),
  ('f1000000-0000-0000-0000-000000000001', 2, 'beef 7 oz/200 g', 'beef'),
  ('f1000000-0000-0000-0000-000000000001', 3, 'dark soy sauce 1 1/2 tsp', 'dark soy sauce'),
  ('f1000000-0000-0000-0000-000000000001', 4, '[Sauce]', '[Sauce]'),
  ('f1000000-0000-0000-0000-000000000001', 5, 'dark soy sauce 2 tbsp', 'dark soy sauce'),
  ('f1000000-0000-0000-0000-000000000001', 6, 'Noodles:', 'Noodles'),
  ('f1000000-0000-0000-0000-000000000001', 7, 'fresh chow mein noodle 16 oz/450 g', 'chow mein noodle');
insert into public.recipe_ingredients (recipe_id, position, raw_text, name)
select 'f1000000-0000-0000-0000-000000000002', g, 'line ' || g, 'line ' || g from generate_series(0, 11) g;
insert into public.recipe_ingredients (recipe_id, position, raw_text, name)
select 'f1000000-0000-0000-0000-000000000003', g, 'line ' || g, 'line ' || g from generate_series(0, 2) g;

select public.repair_heading_lines() as gone \gset
select set_config('test.gone', :'gone', false);
do $$ begin
  assert current_setting('test.gone')::int = 3, 'three heading lines went: ' || current_setting('test.gone');
  assert (select string_agg(raw_text || '=' || coalesce(section, '-'), ', ' order by position)
          from public.recipe_ingredients where recipe_id = 'f1000000-0000-0000-0000-000000000001')
       = 'salt=-, beef 7 oz/200 g=Marinade, dark soy sauce 1 1/2 tsp=Marinade, dark soy sauce 2 tbsp=Sauce, fresh chow mein noodle 16 oz/450 g=Noodles',
    'each line under its heading';
end $$;

-- 3. A reread gives parts to a recipe without any, never over the person's -------------------------------------

select updated_at as read_at from public.recipes where id = 'f1000000-0000-0000-0000-000000000002' \gset
set role service_role;
select public.apply_reread('f1000000-0000-0000-0000-000000000002', :'read_at',
  (select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'name', name, 'section', case when position < 6 then 'Dough' else 'Filling' end))
   from public.recipe_ingredients where recipe_id = 'f1000000-0000-0000-0000-000000000002')) as wrote \gset
reset role;
select updated_at as read_again from public.recipes where id = 'f1000000-0000-0000-0000-000000000001' \gset
set role service_role;
select public.apply_reread('f1000000-0000-0000-0000-000000000001', :'read_again',
  (select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'name', name, 'section', 'Not theirs'))
   from public.recipe_ingredients where recipe_id = 'f1000000-0000-0000-0000-000000000001')) as kept \gset
reset role;
do $$ begin
  assert (select count(distinct section) from public.recipe_ingredients where recipe_id = 'f1000000-0000-0000-0000-000000000002') = 2,
    'a recipe without parts takes the ones found';
  assert not exists (select 1 from public.recipe_ingredients where recipe_id = 'f1000000-0000-0000-0000-000000000001' and section = 'Not theirs'),
    'the person''s sections stay';
end $$;

-- 4. Recipes of 6 lines or more without parts are read again once ----------------------------------------------

update public.recipe_ingredients set section = null where recipe_id = 'f1000000-0000-0000-0000-000000000002';
update public.import_jobs set status = 'done' where kind = 'reread' and status in ('queued', 'processing');
select public.queue_part_rereads() as first \gset
select public.queue_part_rereads() as second \gset
select set_config('test.second', :'second', false);
do $$ begin
  assert exists (select 1 from public.import_jobs where kind = 'reread' and status = 'queued' and created_by is null
                 and subject_id = 'f1000000-0000-0000-0000-000000000002'), 'twelve lines without parts: read again, by the server';
  assert not exists (select 1 from public.import_jobs where kind = 'reread' and status = 'queued'
                     and subject_id in ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003')),
    'not one with parts, not a short one';
  assert current_setting('test.second')::int = 0, 'once';
end $$;
update public.import_jobs set status = 'done' where kind = 'reread' and status = 'queued';

select 'PARTS TESTS PASSED' as result;
