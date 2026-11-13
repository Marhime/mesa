-- Ingredient sections, and a product used in several of them counted once (migration 26).
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as casa from public.households where name = 'Casa' \gset
select set_config('test.casa', :'casa', false);

-- A stir-fry: dark soy sauce in the marinade, the sauce and the noodles; oyster sauce twice; sugar in two
-- units; garlic that is no product.
insert into public.products (id, household_id, name_en, category, family, picto) values
  ('c5000000-0000-0000-0000-000000000001', :'casa', 'Dark soy sauce', 'cupboard', 'sauces', 'bottle'),
  ('c5000000-0000-0000-0000-000000000002', :'casa', 'Oyster sauce', 'cupboard', 'sauces', 'bottle'),
  ('c5000000-0000-0000-0000-000000000003', :'casa', 'Caster sugar', 'cupboard', 'baking', 'bag');
insert into public.recipes (id, household_id, title, servings, source_platform) values
  ('c6000000-0000-0000-0000-000000000001', :'casa', 'Beef chow mein', 4, 'instagram');
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit, section) values
  ('c6000000-0000-0000-0000-000000000001', 0, 'dark soy sauce 1 tsp', 'dark soy sauce', 'c5000000-0000-0000-0000-000000000001', 1, 'tsp', 'Marinade'),
  ('c6000000-0000-0000-0000-000000000001', 1, 'oyster sauce 1 tsp', 'oyster sauce', 'c5000000-0000-0000-0000-000000000002', 1, 'tsp', 'Marinade'),
  ('c6000000-0000-0000-0000-000000000001', 2, 'sugar 1 tsp', 'sugar', 'c5000000-0000-0000-0000-000000000003', 1, 'tsp', 'Marinade'),
  ('c6000000-0000-0000-0000-000000000001', 3, 'dark soy sauce 1 1/2 tsp', 'dark soy sauce', 'c5000000-0000-0000-0000-000000000001', 1.5, 'tsp', 'Sauce'),
  ('c6000000-0000-0000-0000-000000000001', 4, 'oyster sauce 2 tsp', 'oyster sauce', 'c5000000-0000-0000-0000-000000000002', 2, 'tsp', 'Sauce'),
  ('c6000000-0000-0000-0000-000000000001', 5, 'sugar 1 tbsp', 'sugar', 'c5000000-0000-0000-0000-000000000003', 1, 'tbsp', 'Sauce'),
  ('c6000000-0000-0000-0000-000000000001', 6, 'dark soy sauce 1 tsp', 'dark soy sauce', 'c5000000-0000-0000-0000-000000000001', 1, 'tsp', 'Noodles'),
  ('c6000000-0000-0000-0000-000000000001', 7, '2 cloves of garlic', 'garlic clove', null, 2, 'clove', 'Noodles');
-- At home: 10 tsp of dark soy sauce (counted), oyster sauce by level only. No sugar.
insert into public.pantry_items (household_id, product_id, zone, quantity, unit, level) values
  (:'casa', 'c5000000-0000-0000-0000-000000000001', 'cupboard', 10, 'tsp', 'full'),
  (:'casa', 'c5000000-0000-0000-0000-000000000002', 'cupboard', null, null, 'full');

-- 1. Sections are stored as written ----------------------------------------------------------------------

do $$ begin
  begin
    insert into public.recipe_ingredients (recipe_id, position, raw_text, name, section)
      values ('c6000000-0000-0000-0000-000000000001', 9, 'salt', 'salt', ' Sauce ');
    assert false, 'a section with spaces around it was stored';
  exception when check_violation then null;
  end;
  begin
    insert into public.recipe_ingredients (recipe_id, position, raw_text, name, section)
      values ('c6000000-0000-0000-0000-000000000001', 9, 'salt', 'salt', repeat('x', 61));
    assert false, 'a 61-character section was stored';
  exception when check_violation then null;
  end;
end $$;

-- 2. One product once -------------------------------------------------------------------------------------

do $$
declare n record;
begin
  assert (select count(*) from public.recipe_needs('c6000000-0000-0000-0000-000000000001')) = 4,
    'dark soy sauce, oyster sauce, sugar, garlic: one row each';
  select * into n from public.recipe_needs('c6000000-0000-0000-0000-000000000001') where product_id = 'c5000000-0000-0000-0000-000000000001';
  assert n.quantity = 3.5 and n.unit = 'tsp' and n.first_position = 0, 'the dark soy sauce of the three sections, added up';
  select * into n from public.recipe_needs('c6000000-0000-0000-0000-000000000001') where product_id = 'c5000000-0000-0000-0000-000000000003';
  assert n.quantity is null and n.unit is null, 'tsp and tbsp of sugar: no amount rather than a wrong one';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

do $$
declare c record;
begin
  select * into c from public.recipe_coverage() where recipe_id = 'c6000000-0000-0000-0000-000000000001';
  assert c.have_count = 2, 'two products at home (dark soy and oyster sauce), each once: ' || c.have_count;
  assert c.need_count = 2, 'sugar and garlic to get, each once: ' || c.need_count;
end $$;

-- Planning adds one sugar line (no amount: two units) and one garlic line; what is at home, nothing.
select public.plan_recipe('c6000000-0000-0000-0000-000000000001', 4) as up_next \gset
do $$ begin
  assert (select count(*) from public.grocery_items where product_id = 'c5000000-0000-0000-0000-000000000003' and status = 'to_buy') = 1, 'sugar once';
  assert (select quantity from public.grocery_items where product_id = 'c5000000-0000-0000-0000-000000000003' and status = 'to_buy') is null, 'with no amount';
  assert (select count(*) from public.grocery_items where label = 'garlic clove' and status = 'to_buy') = 1, 'garlic once';
  assert not exists (select 1 from public.grocery_items where product_id in ('c5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002') and status = 'to_buy'),
    'nothing that is at home';
end $$;

-- Cooked! takes each product once: 3.5 tsp of dark soy sauce, and the oyster sauce bottle one step down.
create temp table cooked as select * from public.cook_recipe('c6000000-0000-0000-0000-000000000001', 4);
do $$ begin
  assert (select count(*) from cooked where product_id = 'c5000000-0000-0000-0000-000000000001') = 1, 'dark soy sauce once';
  assert (select used from cooked where product_id = 'c5000000-0000-0000-0000-000000000001') = 3.5, 'its three lines together';
  assert (select quantity from public.pantry_items where product_id = 'c5000000-0000-0000-0000-000000000001') = 6.5, '10 - 3.5 tsp left';
  assert (select count(*) from cooked where product_id = 'c5000000-0000-0000-0000-000000000002') = 1, 'oyster sauce once';
  assert (select level from public.pantry_items where product_id = 'c5000000-0000-0000-0000-000000000002') = 'half',
    'one step down, not one per line';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
select 'SECTIONS TESTS PASSED' as result;
