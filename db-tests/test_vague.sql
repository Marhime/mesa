-- Vague household products ("Other", "Sauce"): recipe lines get their own names back, are relinked only
-- by exact name, and the vague products lose the aliases they swallowed (the Bò Kho import).
\set ON_ERROR_STOP on

reset role;
select id as household from public.households where name = 'Casa' \gset
select id as soy from public.products where household_id is null and name_en = 'Soy sauce' \gset

do $$ begin
  assert public.is_vague_name('Other') and public.is_vague_name('sauce') and public.is_vague_name(' Spices ')
     and public.is_vague_name('misc grocery') and public.is_vague_name('Other sauce') and public.is_vague_name('N/A')
     and public.is_vague_name('spice mix'), 'vague names';
  assert not public.is_vague_name('Fish sauce') and not public.is_vague_name('Star anise') and not public.is_vague_name('Vegetable oil')
     and not public.is_vague_name('Bò Kho seasoning') and not public.is_vague_name('') and not public.is_vague_name(null), 'specific names';

  assert public.ingredient_label('2 tbsp fish sauce') = 'Fish sauce', 'fish sauce';
  assert public.ingredient_label('1.5 tbsp Bò Kho seasoning') = 'Bò Kho seasoning', 'seasoning';
  assert public.ingredient_label('2–3 star anise') = 'Star anise', 'a range';
  assert public.ingredient_label('2 tbsp minced lemongrass') = 'Minced lemongrass', 'lemongrass';
  assert public.ingredient_label('1 thumb ginger, sliced') = 'Thumb ginger', 'prep note after a comma';
  assert public.ingredient_label('1.4 kg / 3 lbs beef, cut into large cubes') = 'Beef', 'two amounts';
  assert public.ingredient_label('2 tbsp annatto oil (or regular oil)') = 'Annatto oil', 'parentheses';
  assert public.ingredient_label('1 1/2 cups beef broth') = 'Beef broth', 'mixed number';
  assert public.ingredient_label('1,5 kg de carne') = 'Carne', 'decimal comma, de';
  assert public.ingredient_label('2 onions') = 'Onions', 'a plain count';
  assert public.ingredient_label('Sal al gusto') = 'Sal', 'to taste';
  assert public.ingredient_label('3') is null, 'nothing but an amount';
end $$;

insert into public.products (id, household_id, name_en, category) values
  ('70000000-0000-0000-0000-000000000001', :'household', 'Other', 'other'),
  ('70000000-0000-0000-0000-000000000002', :'household', 'Sauce', 'cupboard'),
  ('70000000-0000-0000-0000-000000000003', :'household', 'Star anise', 'cupboard'),
  ('70000000-0000-0000-0000-000000000004', :'household', 'Achiote paste', 'cupboard');
insert into public.product_aliases (product_id, alias) values
  ('70000000-0000-0000-0000-000000000001', 'other'),
  ('70000000-0000-0000-0000-000000000001', 'star anise'),
  ('70000000-0000-0000-0000-000000000001', 'minced lemongrass'),
  ('70000000-0000-0000-0000-000000000002', 'fish sauce'),
  ('70000000-0000-0000-0000-000000000004', 'achiote paste'),
  ('70000000-0000-0000-0000-000000000004', 'paste');

insert into public.recipes (id, household_id, title, servings, source_platform, original) values
  ('71000000-0000-0000-0000-000000000001', :'household', 'Bò Kho', 4, 'text', '{"ingredients": [
    {"raw_text": "2 tbsp fish sauce", "name_en": "fish sauce"},
    {"raw_text": "1.5 tbsp Bò Kho seasoning", "name_en": "other"},
    {"raw_text": "2–3 star anise", "name_en": "other"},
    {"raw_text": "2 tbsp minced lemongrass", "name_en": "lemongrass"}
  ]}'),
  ('71000000-0000-0000-0000-000000000002', :'household', 'Typed by hand', 2, 'manual', null);
insert into public.recipe_ingredients (recipe_id, position, raw_text, name, product_id, quantity, unit) values
  ('71000000-0000-0000-0000-000000000001', 0, '2 tbsp fish sauce', 'Sauce', '70000000-0000-0000-0000-000000000002', 2, 'tbsp'),
  ('71000000-0000-0000-0000-000000000001', 1, '1.5 tbsp Bò Kho seasoning', 'Other', '70000000-0000-0000-0000-000000000001', 1.5, 'tbsp'),
  ('71000000-0000-0000-0000-000000000001', 2, '2–3 star anise', 'Other', '70000000-0000-0000-0000-000000000001', 3, 'unit'),
  ('71000000-0000-0000-0000-000000000001', 3, '2 tbsp minced lemongrass', 'Other', '70000000-0000-0000-0000-000000000001', 2, 'tbsp'),
  ('71000000-0000-0000-0000-000000000001', 4, '2 tbsp soy sauce', 'Soy sauce', :'soy', 2, 'tbsp'),
  ('71000000-0000-0000-0000-000000000002', 0, '1 tbsp sauce', 'Sauce', '70000000-0000-0000-0000-000000000002', 1, 'tbsp'),
  ('71000000-0000-0000-0000-000000000002', 1, '1 tsp achiote paste', 'Achiote paste', '70000000-0000-0000-0000-000000000004', 1, 'tsp');

do $$
declare
  v_lines text;
begin
  assert public.repair_vague_products() = 5, 'five lines pointed to a vague product';
  select string_agg(name || '=' || coalesce(product_id::text, '-'), ', ' order by position) into v_lines
  from public.recipe_ingredients where recipe_id = '71000000-0000-0000-0000-000000000001';
  assert v_lines = 'Fish sauce=-, Bò Kho seasoning=-, Star anise=70000000-0000-0000-0000-000000000003, Lemongrass=-, Soy sauce='
                   || (select id from public.products where household_id is null and name_en = 'Soy sauce'), 'own names back: ' || v_lines;
  assert (select name = 'Sauce' and product_id is null from public.recipe_ingredients
          where recipe_id = '71000000-0000-0000-0000-000000000002' and position = 0), 'a line that says only "sauce" keeps its word, unlinked';
  assert (select product_id = '70000000-0000-0000-0000-000000000004' from public.recipe_ingredients
          where recipe_id = '71000000-0000-0000-0000-000000000002' and position = 1), 'a specific product keeps its lines';
  assert not exists (select 1 from public.product_aliases where product_id in ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002')),
    'vague products lose the labels they swallowed';
  assert (select array_agg(alias order by alias) from public.product_aliases where product_id = '70000000-0000-0000-0000-000000000004') = array['achiote paste'],
    'a vague alias goes, the real one stays';
  assert (select count(*) from public.products where id in ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002')) = 2,
    'the products stay (a pantry or a list may hold them)';
end $$;
do $$ begin
  assert public.repair_vague_products() = 0, 'running it again changes nothing';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    perform public.repair_vague_products();
    assert false, 'the app ran the repair';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'VAGUE PRODUCT TESTS PASSED' as result;
