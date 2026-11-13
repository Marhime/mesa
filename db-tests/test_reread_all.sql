-- Every recipe read again once: all recipes with lines, not those read in the last hour or waiting, and
-- always leaving the people part of the day's quota.
\set ON_ERROR_STOP on

reset role;
update public.import_jobs set status = 'done' where status in ('queued', 'processing');

insert into public.households (id, name) values
  ('91000000-0000-0000-0000-000000000001', 'All one'),
  ('91000000-0000-0000-0000-000000000002', 'All two');
insert into public.recipes (id, household_id, title, source_platform) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Linked', 'web'),
  ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'No lines', 'manual'),
  ('92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', 'Read just now', 'web'),
  ('92000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000002', 'Busy one', 'web'),
  ('92000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-000000000002', 'Busy two', 'web');
insert into public.recipe_ingredients (recipe_id, position, raw_text, name)
select r, 0, '1 tsp dark soy sauce', 'Soy sauce'
from unnest(array['92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000003',
                  '92000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000005']::uuid[]) r;
insert into public.import_jobs (household_id, kind, subject_id, input_text, status, created_at) values
  ('91000000-0000-0000-0000-000000000001', 'reread', '92000000-0000-0000-0000-000000000003', 'Read just now', 'done', now() - interval '10 minutes');
-- Household two used 44 of its 60 today: with 15 kept for the people, one recipe more fits.
insert into public.import_jobs (household_id, kind, input_text, status)
select '91000000-0000-0000-0000-000000000002', 'recipe', 'import ' || g, 'done' from generate_series(1, 44) g;

do $$
declare n int;
begin
  perform public.queue_all_rereads();
  -- Other test households have recipes too: count ours.
  select count(*) into n from public.import_jobs where kind = 'reread' and status = 'queued'
    and household_id in ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002');
  assert n = 2, format('two rereads queued (one per household), got %s', n);
  assert exists (select 1 from public.import_jobs where kind = 'reread' and status = 'queued'
                 and subject_id = '92000000-0000-0000-0000-000000000001' and created_by is null), 'a linked recipe is read again';
  assert not exists (select 1 from public.import_jobs where kind = 'reread' and status = 'queued'
                     and subject_id in ('92000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000003')),
    'no lines, or read in the last hour: left alone';
  assert (select count(*) from public.import_jobs where kind = 'reread' and status = 'queued'
          and household_id = '91000000-0000-0000-0000-000000000002') = 1, 'the people keep 15 of the day''s quota';
  assert public.queue_all_rereads() = 0, 'running it again queues nothing new';
end $$;

set role authenticated;
do $$ begin
  perform public.queue_all_rereads();
  raise exception 'the app may not queue everyone''s rereads';
exception when insufficient_privilege then null;
end $$;
reset role;

delete from public.import_jobs where household_id in ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002');
delete from public.households where id in ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002');

\echo ' REREAD ALL TESTS PASSED'
