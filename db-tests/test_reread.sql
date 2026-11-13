-- Redo ingredients: the 'reread' kind, the quick lane, the one-time queue within the day's quota, and what
-- the app may do with it.
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as casa from public.households where name = 'Casa' \gset
select id as tomato from public.products where household_id is null and name_en = 'Tomato' \gset
-- Start from an empty queue, and a fresh day for Casa (the app inserts one below).
update public.import_jobs set status = 'done' where status in ('queued', 'processing');
delete from public.import_jobs where household_id = :'casa' and not public.is_background_kind(kind);
delete from public.household_usage where household_id = :'casa';

do $$ begin
  assert public.is_quick_kind('reread') and public.is_quick_kind('ask'), 'reread is a quick kind';
  assert not public.is_background_kind('reread'), 'reread is not background work';
  assert not public.is_quick_kind('recipe') and not public.is_quick_kind('tidy'), 'other kinds are not quick';
end $$;

-- Two households of our own: one to pick recipes in, one near its day's quota.
insert into public.households (id, name) values
  ('81000000-0000-0000-0000-000000000001', 'Reread one'),
  ('81000000-0000-0000-0000-000000000002', 'Reread two');

insert into public.recipes (id, household_id, title, source_platform, updated_at) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'A line unlinked', 'web', now() - interval '1 hour'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'All linked', 'web', now()),
  ('82000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001', 'No lines', 'manual', now()),
  ('82000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', 'Already waiting', 'web', now()),
  ('82000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000001', 'Read before', 'web', now()),
  ('82000000-0000-0000-0000-000000000006', '81000000-0000-0000-0000-000000000001', 'Being read', 'web', now()),
  ('82000000-0000-0000-0000-000000000007', '81000000-0000-0000-0000-000000000002', 'Newest', 'web', now() - interval '1 hour'),
  ('82000000-0000-0000-0000-000000000008', '81000000-0000-0000-0000-000000000002', 'Second', 'web', now() - interval '2 hours'),
  ('82000000-0000-0000-0000-000000000009', '81000000-0000-0000-0000-000000000002', 'Third', 'web', now() - interval '3 hours'),
  ('82000000-0000-0000-0000-000000000010', '81000000-0000-0000-0000-000000000002', 'Fourth', 'web', now() - interval '4 hours'),
  ('82000000-0000-0000-0000-000000000011', '81000000-0000-0000-0000-000000000002', 'Oldest', 'web', now() - interval '5 hours');

-- The recipes were last changed at their own updated_at: their lines go in without touching them (migration 25).
alter table public.recipe_ingredients disable trigger user;
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id)
select r, 0, '2 tbsp sour shrimp paste', 'Sour shrimp paste', null
from unnest(array[
  '82000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000005',
  '82000000-0000-0000-0000-000000000006', '82000000-0000-0000-0000-000000000007', '82000000-0000-0000-0000-000000000008',
  '82000000-0000-0000-0000-000000000009', '82000000-0000-0000-0000-000000000010', '82000000-0000-0000-0000-000000000011'
]::uuid[]) r;
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id) values
  ('82000000-0000-0000-0000-000000000001', 1, '3 tomatoes', 'Tomato', :'tomato'),
  ('82000000-0000-0000-0000-000000000002', 0, '3 tomatoes', 'Tomato', :'tomato');
alter table public.recipe_ingredients enable trigger user;

-- Rereads that already exist: a person's, waiting (oldest quick job of all), done, being read.
insert into public.import_jobs (id, household_id, kind, subject_id, input_text, status, created_at, started_at, created_by) values
  ('83000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', 'reread', '82000000-0000-0000-0000-000000000004', 'Already waiting', 'queued', now() - interval '5 minutes', null, '00000000-0000-0000-0000-00000000000a'),
  ('83000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000001', 'reread', '82000000-0000-0000-0000-000000000005', 'Read before', 'done', now() - interval '1 hour', null, null),
  ('83000000-0000-0000-0000-000000000006', '81000000-0000-0000-0000-000000000001', 'reread', '82000000-0000-0000-0000-000000000006', 'Being read', 'processing', now() - interval '1 minute', now(), null);
-- A person's import waiting longer than any reread: the quick lane never takes it.
insert into public.import_jobs (id, household_id, kind, input_text, created_at, created_by) values
  ('83000000-0000-0000-0000-000000000099', '81000000-0000-0000-0000-000000000001', 'recipe', 'a pasted recipe', now() - interval '10 minutes', '00000000-0000-0000-0000-00000000000a');

-- Household two used 57 of its 60 jobs today; tidying and jobs from two days ago don't count.
insert into public.import_jobs (household_id, kind, input_text, status)
select '81000000-0000-0000-0000-000000000002', 'recipe', 'import ' || g, 'done' from generate_series(1, 57) g;
insert into public.import_jobs (household_id, kind, input_text, status)
select '81000000-0000-0000-0000-000000000002', 'tidy', 'tidy ' || g, 'done' from generate_series(1, 3) g;
insert into public.import_jobs (household_id, kind, input_text, status, created_at)
select '81000000-0000-0000-0000-000000000002', 'recipe', 'old ' || g, 'done', now() - interval '2 days' from generate_series(1, 5) g;

-- The kind is accepted (and only known kinds are).
do $$ begin
  begin
    insert into public.import_jobs (household_id, kind, input_text) values ('81000000-0000-0000-0000-000000000001', 'redo', 'x');
    assert false, 'an unknown kind was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- The one-time queue.
do $$
declare
  v_before int := (select count(*) from public.import_jobs where kind = 'reread');
  v_queued int;
  v_one text;
  v_two text;
begin
  v_queued := public.queue_rereads();
  assert v_queued = (select count(*) from public.import_jobs where kind = 'reread') - v_before, 'returns how many it queued';

  select string_agg(r.title, ', ' order by r.title) into v_one
  from public.import_jobs j join public.recipes r on r.id = j.subject_id
  where j.kind = 'reread' and j.household_id = '81000000-0000-0000-0000-000000000001' and j.status = 'queued'
    and j.id <> '83000000-0000-0000-0000-000000000004';
  assert v_one = 'A line unlinked, Read before', 'an unlinked line, not all linked, no lines, already waiting or being read: ' || coalesce(v_one, '-');
  assert (select count(*) from public.import_jobs where kind = 'reread' and subject_id = '82000000-0000-0000-0000-000000000004') = 1,
    'a recipe already waiting gets no second reread';

  select string_agg(r.title, ', ' order by r.updated_at desc) into v_two
  from public.import_jobs j join public.recipes r on r.id = j.subject_id
  where j.kind = 'reread' and j.household_id = '81000000-0000-0000-0000-000000000002';
  assert v_two = 'Newest, Second, Third', 'what is left of the day (60 - 57), most recently changed first: ' || coalesce(v_two, '-');
  assert (select count(*) from public.import_jobs
          where household_id = '81000000-0000-0000-0000-000000000002' and not public.is_background_kind(kind)
            and created_at > now() - interval '1 day') = 60, 'household two is exactly at its quota, never over';

  assert (select bool_and(j.input_text = r.title and j.household_id = r.household_id and j.status = 'queued'
                          and j.created_by is null and j.input_url is null)
          from public.import_jobs j join public.recipes r on r.id = j.subject_id
          where j.kind = 'reread' and j.created_at = now()), 'title as the label, the recipe''s household, nobody''s request';
  assert (select count(*) from public.import_jobs j where j.kind = 'reread' and j.created_at = now() and j.household_id = (select id from public.households where name = 'Casa'))
       = (select count(*) from public.recipes r where r.household_id = (select id from public.households where name = 'Casa')
          and exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id and i.product_id is null)),
    'Casa: every recipe with an unlinked line';
end $$;

do $$ begin
  assert public.queue_rereads() = 0, 'running it again queues nothing';
end $$;

-- People first (migration 24): the quick lane takes a person's reread, never the server's one-time rereads;
-- the any lane takes the person's import before them, then the server's rereads, one household at a time.
set role service_role;
do $$
declare
  j public.import_jobs;
begin
  select * into j from public.claim_import_job('quick');
  assert j.id = '83000000-0000-0000-0000-000000000004' and j.status = 'processing' and j.stage = 'opening', 'a person''s reread in the quick lane';
  assert (select count(*) from public.claim_import_job('quick')) = 0, 'the quick lane never takes the server''s rereads';
  select * into j from public.claim_import_job('any');
  assert j.id = '83000000-0000-0000-0000-000000000099', 'any lane: the person''s import before the server''s rereads';
  loop
    select * into j from public.claim_import_job('any');
    exit when j.id is null;
    assert j.kind = 'reread' and j.created_by is null, 'then the server''s rereads, not ' || j.kind;
    assert j.household_id <> '81000000-0000-0000-0000-000000000001', 'none while the household''s import runs';
    assert (select count(*) from public.import_jobs
            where household_id = j.household_id and status = 'processing' and claimed_lane = 'any') = 1, 'one at a time per household';
  end loop;
  assert exists (select 1 from public.import_jobs where household_id = '81000000-0000-0000-0000-000000000001'
                 and kind = 'reread' and status = 'queued'), 'the household''s rereads wait for its import';
  update public.import_jobs set status = 'done' where id = '83000000-0000-0000-0000-000000000099';
  select * into j from public.claim_import_job('any');
  assert j.household_id = '81000000-0000-0000-0000-000000000001' and j.kind = 'reread', 'its import done, its rereads go';
end $$;

-- The app asks for a reread of its own recipe; the answer is the worker's to write.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.import_jobs (kind, subject_id, input_text)
  values ('reread', '71000000-0000-0000-0000-000000000001', 'Bò Kho') returning id as app_job \gset
do $$
declare v public.import_jobs;
begin
  select * into v from public.import_jobs where kind = 'reread' and created_by = '00000000-0000-0000-0000-00000000000a';
  assert v.household_id = public.current_household_id() and v.status = 'queued', 'queued in the household';
  begin
    update public.import_jobs set result = '{"lines": 9, "linked": 9}' where id = v.id;
    assert false, 'the app wrote a result';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.queue_rereads();
    assert false, 'the app ran the one-time queue';
  exception when insufficient_privilege then null;
  end;
end $$;
-- The worker answers.
reset role;
update public.import_jobs set status = 'done', result = '{"lines": 5, "linked": 4}' where id = :'app_job';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select result ->> 'linked' from public.import_jobs where kind = 'reread' and created_by = '00000000-0000-0000-0000-00000000000a') = '4',
    'the household reads the answer';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.import_jobs where kind = 'reread') = 0, 'a stranger sees no reread';
end $$;

reset role;
select 'REREAD TESTS PASSED' as result;
