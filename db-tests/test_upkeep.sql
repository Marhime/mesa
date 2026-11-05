-- Keeping the pantry true (lot 1). Runs after test_pantry.sql, in Marhime's household.
\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- The "+" sheet: a catalog product (owned for a while: no date), a typed fresh one, an unknown word
select public.add_to_pantry(jsonb_build_array(
  jsonb_build_object('product_id', '10000000-0000-0000-0000-000000000003'),
  jsonb_build_object('product_id', '10000000-0000-0000-0000-000000000005', 'dated', true, 'quantity', 200, 'unit', 'ml'),
  jsonb_build_object('label', 'pan dulce', 'category', 'bakery')
)) as added \gset
do $$
declare v_pan uuid;
begin
  assert (select expires_on from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000003') is null,
    'stock owned for a while gets no date';
  select id into v_pan from public.products where name_en = 'Pan dulce' and household_id = public.current_household_id();
  assert v_pan is not null, 'an unknown word becomes a household product';
  assert (select zone from public.pantry_items where product_id = v_pan) = 'cupboard', 'bakery goes to the cupboard';
  assert public.pantry_has(public.current_household_id(), v_pan), 'pan dulce is at home';
  assert (select count(*) from public.pantry_events where reason = 'correction') >= 3, 'stocking is logged';
end $$;

-- States: soon, check (expired 2 days ago, still counted), gone (expired 5 days ago, not counted)
update public.pantry_items set expires_on = current_date + 2 where product_id = '10000000-0000-0000-0000-000000000003';
update public.pantry_items set expires_on = current_date - 2 where product_id = '10000000-0000-0000-0000-000000000001';
update public.pantry_items set expires_on = current_date - 5, level = 'full', quantity = 3
  where product_id = '10000000-0000-0000-0000-000000000004';
do $$ begin
  assert (select state from public.pantry_status where product_id = '10000000-0000-0000-0000-000000000003') = 'soon', 'milk: soon';
  assert (select state from public.pantry_status where product_id = '10000000-0000-0000-0000-000000000001') = 'check', 'avocado: check';
  assert (select bool_and(state = 'gone') from public.pantry_status where product_id = '10000000-0000-0000-0000-000000000004'),
    'chicken (fridge and freezer): gone';
  assert public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000001'), 'checking still counts as at home';
  assert not public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000004'), 'gone does not';
  assert (select soon_names from public.recipe_coverage() where recipe_id = '20000000-0000-0000-0000-000000000002')
         = '{}', 'expired food is never "use soon"';
end $$;

-- Staples: listed, can run out (and go on the list), can be turned off, come back when bought
do $$ begin
  assert exists (select 1 from public.always_have_list() where product_id = '10000000-0000-0000-0000-000000000002' and not is_out),
    'salt is a staple at home';
end $$;
select public.pantry_out('10000000-0000-0000-0000-000000000002') as salt_line \gset
select set_config('test.salt_line', :'salt_line', false);
do $$ begin
  assert not public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000002'), 'salt marked out';
  assert exists (select 1 from public.always_have_list() where product_id = '10000000-0000-0000-0000-000000000002' and is_out),
    'the staples list shows it out';
  assert (select source from public.grocery_items where id = current_setting('test.salt_line')::uuid) = 'ran_out', 'salt is on the list';
end $$;
update public.grocery_items set status = 'in_cart' where id = :'salt_line'::uuid;
select public.complete_shopping() as bought \gset
do $$ begin
  assert public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000002'), 'bought salt is back';
end $$;
select public.set_always_have('10000000-0000-0000-0000-000000000002', false);
delete from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000002';
do $$ begin
  assert not public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000002'), 'not a staple here';
  assert not exists (select 1 from public.always_have_list() where product_id = '10000000-0000-0000-0000-000000000002'),
    'left out of the staples list';
end $$;

-- Per ingredient: at home, soon, always
do $$
declare a record;
begin
  select * into a from public.ingredient_availability('20000000-0000-0000-0000-000000000002')
  where ingredient_id = (select id from public.recipe_ingredients
                         where recipe_id = '20000000-0000-0000-0000-000000000002' and name = 'Salt');
  assert not a.at_home and not a.always_have, 'salt now has to be bought';
  select * into a from public.ingredient_availability('20000000-0000-0000-0000-000000000002')
  where ingredient_id = (select id from public.recipe_ingredients
                         where recipe_id = '20000000-0000-0000-0000-000000000002' and name = 'Cilantro');
  assert not a.at_home, 'unknown ingredients are never at home';
end $$;

-- Moving to a zone that already has the product merges the two rows
insert into public.pantry_items (product_id, zone, quantity, unit, level) values
  ('10000000-0000-0000-0000-000000000005', 'freezer', 100, 'ml', 'full');
select public.set_pantry_item(
  (select id from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000005' and zone = 'freezer'),
  null, 'fridge') as merged \gset
select set_config('test.merged', :'merged', false);
do $$ begin
  assert (select count(*) from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000005') = 1, 'one row left';
  assert (select quantity from public.pantry_items where id = current_setting('test.merged')::uuid) = 300, '200 + 100 ml of crema';
end $$;
select public.set_pantry_item(:'merged'::uuid, 'low');
do $$ begin
  assert (select level from public.pantry_items where id = current_setting('test.merged')::uuid) = 'low', 'level corrected';
  assert (select quantity from public.pantry_items where id = current_setting('test.merged')::uuid) is null, 'a level replaces the amount';
end $$;

-- Done shopping puts away what the catalog doesn't know
select (public.add_grocery_item('Tamales de rajas', null, 6, 'unit', 'other')).id as tamales \gset
select set_config('test.tamales', :'tamales', false);
update public.grocery_items set status = 'in_cart' where id = :'tamales'::uuid;
select public.complete_shopping(jsonb_build_array(
  jsonb_build_object('id', :'tamales', 'zone', 'freezer', 'expires_on', null))) as bought2 \gset
do $$ begin
  assert (select s.zone from public.pantry_items s join public.products p on p.id = s.product_id
          where p.name_en = 'Tamales de rajas') = 'freezer', 'unknown purchases are put away';
  assert (select product_id is not null from public.grocery_items where id = current_setting('test.tamales')::uuid), 'the line now knows its product';
end $$;

-- Another household sees none of it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.pantry_status) = 0, 'stranger sees no pantry';
  assert (select count(*) from public.household_staples) = 0, 'stranger sees no staples';
end $$;

reset role;
select 'UPKEEP TESTS PASSED' as result;
