-- Pantry by type of food (families, pictos) and grocery lines that keep what you asked for.
\set ON_ERROR_STOP on

reset role;
do $$ begin
  assert (select family from public.products where household_id is null and name_en = 'Avocado') = 'vegetables', 'avocado is a vegetable';
  assert (select picto from public.products where household_id is null and name_en = 'Egg') = 'egg', 'an egg looks like an egg';
  assert not exists (select 1 from public.products
                     where id = md5('mesa-catalog:' || lower(name_en))::uuid and (family is null or picto is null)),
    'every catalog product has a family and a picto';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select family from public.pantry_status where name_en = 'Cilantro' limit 1) = 'herbs_chiles', 'the pantry knows the family';
  assert (select picto from public.pantry_status where name_en = 'Cilantro' limit 1) = 'herb', 'and the picto';
end $$;

-- A recipe adds 200 g of huitlacoche; the partner also types "huitlacoche"; the recipe leaves the menu
insert into public.recipes (id, title, servings) values ('20000000-0000-0000-0000-000000000009', 'Quesadillas', 2);
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit) values
  ('20000000-0000-0000-0000-000000000009', 0, '200 g de huitlacoche', 'Huitlacoche', null, 200, 'g');
select public.plan_recipe('20000000-0000-0000-0000-000000000009', 2) as up_next \gset
do $$ begin
  assert (select source from public.grocery_items where label = 'Huitlacoche' and status = 'to_buy') = 'recipe', 'added by the recipe';
end $$;
select public.add_grocery_item('Huitlacoche', null, null, null, 'produce', 'manual');
do $$ begin
  assert (select count(*) from public.grocery_items where label = 'Huitlacoche' and status = 'to_buy') = 1, 'one line';
  assert (select source from public.grocery_items where label = 'Huitlacoche' and status = 'to_buy') = 'manual', 'now also asked for by hand';
end $$;
select public.unplan(:'up_next');
do $$ begin
  assert exists (select 1 from public.grocery_items where label = 'Huitlacoche' and status = 'to_buy'), 'the line the partner asked for stays';
  assert (select quantity from public.grocery_items where label = 'Huitlacoche' and status = 'to_buy') is null, 'no "0 g" left behind';
end $$;

reset role;
select 'BY TYPE TESTS PASSED' as result;
