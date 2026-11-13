-- End-to-end checks of the step 1 functions and row level security.
\set ON_ERROR_STOP on

-- people and catalog (as the superuser running the tests)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'marhime@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'karla@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@example.com');

-- Test products with fixed ids. Named "Test ..." so they never collide with the real catalog
-- (20261105000005_catalog.sql already has Avocado, Salt and Milk).
insert into public.products (id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family) values
  ('10000000-0000-0000-0000-000000000001', 'Test avocado', 'produce', 'fridge', 5, false, 'count'),
  ('10000000-0000-0000-0000-000000000002', 'Test salt', 'cupboard', 'cupboard', null, true, 'mass'),
  ('10000000-0000-0000-0000-000000000003', 'Test milk', 'dairy', 'fridge', 7, false, 'volume')
on conflict do nothing;

-- The shared catalog migration loaded, and loading it again changes nothing
create temp table catalog_before as
  select (select count(*) from public.products where household_id is null) as products,
         (select count(*) from public.product_aliases) as aliases;
\ir ../supabase/migrations/20261105000005_catalog.sql
do $$ begin
  assert (select count(*) from public.products where household_id is null) = (select products from catalog_before),
    'catalog re-run adds no products';
  assert (select count(*) from public.product_aliases) = (select aliases from catalog_before), 'catalog re-run adds no aliases';
  assert (select products from catalog_before) >= 150, 'catalog has its products';
  assert (select count(*) from public.products where id in (
    '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003')) = 3,
    'test products sit next to the catalog';
  assert (select p.name_en from public.product_aliases a join public.products p on p.id = a.product_id
          where a.alias = 'jitomates') = 'Tomato', 'alias lookup: jitomates is Tomato';
  assert (select is_staple from public.products where name_en = 'Salt' and household_id is null), 'catalog salt is a staple';
  assert (select id from public.products where name_en = 'Milk' and household_id is null) = md5('mesa-catalog:milk')::uuid,
    'catalog ids are stable';
end $$;
drop table catalog_before;

do $$ begin
  assert (select count(*) from public.profiles) = 3, 'a profile is created for each new account';
end $$;

-- Marhime creates the household and an invite
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.create_household('Casa') as household \gset
select public.create_invite() as code \gset

-- Karla joins with the code
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.join_household(:'code') = :'household'::uuid as joined \gset
do $$ begin
  assert public.current_household_id() is not null, 'Karla is in a household';
end $$;

-- Karla adds avocados twice: one merged line
select (public.add_grocery_item('aguacates', '10000000-0000-0000-0000-000000000001', 2, 'unit', 'produce')).id as avo \gset
select public.add_grocery_item('avocado', '10000000-0000-0000-0000-000000000001', 1, 'unit', 'produce');
select public.add_grocery_item('Dish soap', null, null, null, 'household');
select public.add_grocery_item('dish soap', null, null, null, 'household');
do $$ begin
  assert (select count(*) from public.grocery_items where status = 'to_buy') = 2, 'merged into two lines';
  assert (select quantity from public.grocery_items where product_id = '10000000-0000-0000-0000-000000000001') = 3, 'quantities add up';
end $$;

-- Marhime saves a recipe for 4 and plans it for 3
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.recipes (id, title, servings) values ('20000000-0000-0000-0000-000000000001', 'Tinga', 4);
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit) values
  ('20000000-0000-0000-0000-000000000001', 0, '2 aguacates', 'Avocado', '10000000-0000-0000-0000-000000000001', 2, 'unit'),
  ('20000000-0000-0000-0000-000000000001', 1, '1 cdta de sal', 'Salt', '10000000-0000-0000-0000-000000000002', 1, 'tsp'),
  ('20000000-0000-0000-0000-000000000001', 2, '100 ml de crema', 'Crema', null, 100, 'ml');
select public.plan_recipe('20000000-0000-0000-0000-000000000001', 3) as up_next \gset

do $$ begin
  assert (select quantity from public.grocery_items where product_id = '10000000-0000-0000-0000-000000000001' and status = 'to_buy') = 5,
    'avocados: 3 already + ceil(2 * 3 / 4) = 5';
  assert not exists (select 1 from public.grocery_items where product_id = '10000000-0000-0000-0000-000000000002'), 'staples are skipped';
  assert (select quantity from public.grocery_items where label = 'Crema') = 75, 'crema scaled to 75 ml';
  assert (select count(*) from public.grocery_item_recipes) = 2, 'two lines linked to the recipe';
end $$;

-- Unplanning gives the list back as it was
select public.unplan(:'up_next');
do $$ begin
  assert (select quantity from public.grocery_items where product_id = '10000000-0000-0000-0000-000000000001' and status = 'to_buy') = 3,
    'avocados back to 3';
  assert not exists (select 1 from public.grocery_items where label = 'Crema'), 'crema removed';
  assert not exists (select 1 from public.up_next), 'up next emptied';
end $$;

-- Plan again, then cook
select public.plan_recipe('20000000-0000-0000-0000-000000000001', 3) as up_next2 \gset
select public.mark_cooked(:'up_next2');
do $$ begin
  assert (select last_cooked_at is not null from public.recipes where id = '20000000-0000-0000-0000-000000000001'), 'cooked date saved';
end $$;

-- Already have the soap; shop the rest
select public.mark_have(id) from public.grocery_items where label = 'Dish soap';
update public.grocery_items set status = 'in_cart', checked_at = now() where status = 'to_buy' and product_id is not null;
select public.complete_shopping() as bought \gset
do $$ begin
  assert (select count(*) from public.grocery_items where status = 'bought') >= 1, 'items bought';
  assert (select quantity from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000001') = 5,
    'pantry has 5 avocados';
  assert (select expires_on from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000001') = current_date + 5,
    'expiry estimated from shelf life';
  assert (select count(*) from public.pantry_events where reason = 'purchase') >= 1, 'purchase logged';
  assert (select count(*) from public.pantry_events where reason = 'have') = 1, 'have logged';
  assert (select count(*) from public.usual_products(5)) = 1, 'avocado is now usual';
end $$;

-- Push token registration is idempotent and lands in the caller's household
select public.register_push_token('ExponentPushToken[test]');
select public.register_push_token('ExponentPushToken[test]');
do $$ begin
  assert (select count(*) from public.push_tokens where token = 'ExponentPushToken[test]'
          and household_id = public.current_household_id()) = 1, 'token registered once in this household';
end $$;

-- A stranger sees nothing
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert public.current_household_id() is null, 'stranger has no household';
  assert (select count(*) from public.grocery_items) = 0, 'stranger sees no groceries';
  assert (select count(*) from public.recipes) = 0, 'stranger sees no recipes';
  assert (select count(*) from public.products) >= 3, 'stranger still sees the shared catalog';
end $$;

-- A wrong code opens nothing (null, and the try is counted: migration 28).
do $$ begin
  assert public.join_household('WRONG1') is null, 'a wrong code opens no kitchen';
  assert public.current_household_id() is null, 'still no household';
end $$;

-- Stranger can't write into Marhime's household
do $$ begin
  begin
    insert into public.grocery_items (household_id, label) values ((select id from public.households limit 1), 'hack');
    raise exception 'should have failed';
  exception when insufficient_privilege or check_violation or not_null_violation then
    null;
  end;
end $$;

-- Import queue, as the worker
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.import_jobs (household_id, input_url) values (:'household', 'https://www.youtube.com/shorts/abc');
set role service_role;
do $$
declare j public.import_jobs;
begin
  select * into j from public.claim_import_job();
  assert j.status = 'processing', 'job claimed';
  assert j.kind = 'recipe', 'an import goes before older tidy jobs';
  assert j.attempts = 1, 'attempt counted';
  assert (select count(*) from public.claim_import_job() where kind <> 'tidy') = 0, 'nothing left to claim but tidying';
end $$;

-- An authenticated person can't claim jobs
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    perform public.claim_import_job();
    raise exception 'should have failed';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
select 'ALL TESTS PASSED' as result;
