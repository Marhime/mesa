-- Step 2: the pantry drives planning, cooking and ideas. Runs after test.sql, in Marhime's household
-- (whose pantry already holds 5 Test avocados from that file).
\set ON_ERROR_STOP on

reset role;
insert into public.products (id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family) values
  ('10000000-0000-0000-0000-000000000004', 'Test chicken', 'meat', 'fridge', 3, false, 'mass'),
  ('10000000-0000-0000-0000-000000000005', 'Test crema', 'dairy', 'fridge', 10, false, 'volume'),
  ('10000000-0000-0000-0000-000000000006', 'Test chipotle', 'cupboard', 'cupboard', null, false, 'count')
on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- Tostadas for 4: avocado (at home), chicken + chipotle (to buy), salt (staple), cilantro (not in the catalog)
insert into public.recipes (id, title, servings) values ('20000000-0000-0000-0000-000000000002', 'Test tostadas', 4);
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit) values
  ('20000000-0000-0000-0000-000000000002', 0, '500 g de pollo', 'Chicken', '10000000-0000-0000-0000-000000000004', 500, 'g'),
  ('20000000-0000-0000-0000-000000000002', 1, '2 aguacates', 'Avocado', '10000000-0000-0000-0000-000000000001', 2, 'unit'),
  ('20000000-0000-0000-0000-000000000002', 2, '1 lata de chipotle', 'Chipotle', '10000000-0000-0000-0000-000000000006', 1, 'can'),
  ('20000000-0000-0000-0000-000000000002', 3, 'sal', 'Salt', '10000000-0000-0000-0000-000000000002', null, null),
  ('20000000-0000-0000-0000-000000000002', 4, 'cilantro', 'Cilantro', null, null, null);

do $$
declare c record;
begin
  select * into c from public.recipe_coverage() where recipe_id = '20000000-0000-0000-0000-000000000002';
  assert c.have_count = 2, 'coverage: salt and avocado are at home';
  assert c.need_count = 3, 'coverage: chicken, chipotle and cilantro to buy';
  assert c.pantry_count = 1, 'coverage: one non-staple at home';
  assert c.soon_names = '{}', 'coverage: nothing to use soon yet';
end $$;

-- Plan it: what is at home stays off the list
select public.plan_recipe('20000000-0000-0000-0000-000000000002', 4) as tostadas \gset
do $$ begin
  assert not exists (select 1 from public.grocery_items
                     where product_id = '10000000-0000-0000-0000-000000000001' and status = 'to_buy'), 'plan skips the avocados at home';
  assert (select quantity from public.grocery_items
          where product_id = '10000000-0000-0000-0000-000000000004' and status = 'to_buy') = 500, 'plan adds the chicken';
  assert exists (select 1 from public.grocery_items where label = 'Cilantro' and status = 'to_buy'), 'plan adds what the catalog does not know';
end $$;

-- Put away: the chicken goes to the freezer and keeps; the chipotle takes its defaults
select id as chicken_item from public.grocery_items
  where product_id = '10000000-0000-0000-0000-000000000004' and status = 'to_buy' \gset
update public.grocery_items set status = 'in_cart', checked_at = now()
  where status = 'to_buy' and product_id in ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000006');
select public.complete_shopping(jsonb_build_array(
  jsonb_build_object('id', :'chicken_item', 'zone', 'freezer', 'expires_on', null)
)) as put_away \gset
do $$ begin
  assert (select zone from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000004') = 'freezer',
    'chicken put in the freezer';
  assert (select expires_on from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000004') is null,
    'a frozen chicken keeps';
  assert (select zone from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000006') = 'cupboard',
    'chipotle takes its default zone';
  assert exists (select 1 from public.grocery_items where label = 'Cilantro' and status = 'to_buy'), 'unchecked items stay on the list';
end $$;

-- The avocados turn tomorrow; crema is known by level only
update public.pantry_items set expires_on = current_date + 1 where product_id = '10000000-0000-0000-0000-000000000001';
insert into public.pantry_items (product_id, zone, level) values ('10000000-0000-0000-0000-000000000005', 'fridge', 'full');
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit) values
  ('20000000-0000-0000-0000-000000000002', 5, '100 ml de crema', 'Crema', '10000000-0000-0000-0000-000000000005', 100, 'ml');

do $$
declare c record;
begin
  select * into c from public.recipe_coverage() where recipe_id = '20000000-0000-0000-0000-000000000002';
  assert c.have_count = 5 and c.need_count = 1, 'coverage: only the cilantro is missing now';
  assert c.soon_names = array['Test avocado'], 'coverage: the avocados should be used soon';
end $$;

-- Cooked! for 8: double amounts
do $$
declare
  r record;
  n int := 0;
begin
  for r in select * from public.cook_recipe('20000000-0000-0000-0000-000000000002', 8) loop
    n := n + 1;
    if r.product_id = '10000000-0000-0000-0000-000000000001' then
      assert r.used = 4 and r.left_quantity = 1 and r.saved and not r.ran_out, 'avocados: 4 used, 1 left, saved from the bin';
      assert r.left_level = 'low', 'avocados: 1 of 5 left is low';
    elsif r.product_id = '10000000-0000-0000-0000-000000000004' then
      assert r.used = 1000 and r.left_quantity = 0 and r.ran_out, 'chicken: ran out';
    elsif r.product_id = '10000000-0000-0000-0000-000000000006' then
      assert r.ran_out, 'chipotle: ran out';
    elsif r.product_id = '10000000-0000-0000-0000-000000000005' then
      assert r.left_level = 'half' and r.left_quantity is null and not r.ran_out, 'crema: one level down';
    end if;
  end loop;
  assert n = 4, 'four ingredients taken from the pantry (not the staple, not the unknown one)';
  assert (select quantity from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000001') = 1, 'pantry: 1 avocado left';
  assert not public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000004'), 'pantry: chicken is out';
  assert (select count(*) from public.grocery_items
          where product_id in ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000006')
            and status = 'to_buy' and source = 'ran_out') = 2, 'what ran out is back on the list';
  assert (select count(*) from public.pantry_events where reason = 'cook') = 4, 'cooking logged';
  assert not exists (select 1 from public.up_next where recipe_id = '20000000-0000-0000-0000-000000000002'), 'left Up next';
  assert (select last_cooked_at is not null from public.recipes where id = '20000000-0000-0000-0000-000000000002'), 'cooked date saved';
end $$;

-- "Already have" brings an used-up product back
select public.mark_have(id) from public.grocery_items
  where product_id = '10000000-0000-0000-0000-000000000004' and status = 'to_buy';
do $$ begin
  assert public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000004'), 'chicken is back at home';
end $$;

-- Another household sees no coverage
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.recipe_coverage()) = 0, 'stranger sees no coverage';
end $$;

reset role;
select 'PANTRY TESTS PASSED' as result;
