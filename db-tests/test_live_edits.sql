-- Edits that reach the other phone (writing lines or steps touches the recipe) and products that say when
-- they last changed (migration 25).
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as casa from public.households where name = 'Casa' \gset
insert into public.recipes (id, household_id, title, source_platform, updated_at)
  values ('b1000000-0000-0000-0000-000000000001', :'casa', 'Live edits', 'manual', now() - interval '1 day');

-- Each write below is its own statement (its own moment); the recipe is set back a day in between.
create function pg_temp.age_recipe() returns void language plpgsql as $$
begin
  alter table public.recipes disable trigger recipes_touch;
  update public.recipes set updated_at = now() - interval '1 day' where id = 'b1000000-0000-0000-0000-000000000001';
  alter table public.recipes enable trigger recipes_touch;
end;
$$;
create function pg_temp.touched() returns boolean language sql as $$
  select updated_at > now() - interval '1 minute' from public.recipes where id = 'b1000000-0000-0000-0000-000000000001'
$$;

do $$ begin
  assert not pg_temp.touched(), 'a day old';
end $$;
insert into public.recipe_ingredients (id, recipe_id, position, raw_text, name) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, '2 eggs', 'Egg'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 1, 'salt', 'Salt');
do $$ begin assert pg_temp.touched(), 'lines added: the recipe changed'; end $$;
select pg_temp.age_recipe();

insert into public.recipe_steps (id, recipe_id, position, text) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0, 'Beat the eggs.');
do $$ begin assert pg_temp.touched(), 'a step added'; end $$;
select pg_temp.age_recipe();

-- The app edits a line and a step (its role may not write recipes.updated_at itself).
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.recipe_ingredients set raw_text = '3 eggs', quantity = 3 where id = 'b2000000-0000-0000-0000-000000000001';
reset role;
do $$ begin assert pg_temp.touched(), 'a line edited in the app'; end $$;
select pg_temp.age_recipe();

set role authenticated;
update public.recipe_steps set text = 'Beat the eggs well.' where id = 'b3000000-0000-0000-0000-000000000001';
reset role;
do $$ begin assert pg_temp.touched(), 'a step edited in the app'; end $$;
select pg_temp.age_recipe();

set role authenticated;
delete from public.recipe_ingredients where id = 'b2000000-0000-0000-0000-000000000002';
reset role;
do $$ begin assert pg_temp.touched(), 'a line removed'; end $$;
select pg_temp.age_recipe();

delete from public.recipe_steps where id = 'b3000000-0000-0000-0000-000000000001';
do $$ begin assert pg_temp.touched(), 'a step removed'; end $$;
select pg_temp.age_recipe();

-- Another recipe's lines leave this one alone; deleting a recipe with its lines works.
insert into public.recipes (id, household_id, title, source_platform)
  values ('b1000000-0000-0000-0000-000000000002', :'casa', 'Another', 'manual');
insert into public.recipe_ingredients (recipe_id, position, raw_text, name) values ('b1000000-0000-0000-0000-000000000002', 0, '1 lime', 'Lime');
do $$ begin assert not pg_temp.touched(), 'only the recipe whose lines changed'; end $$;
delete from public.recipes where id in ('b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002');

-- Products say when they (or their aliases) last changed.
insert into public.products (id, household_id, name_en, category, updated_at)
  values ('b4000000-0000-0000-0000-000000000001', :'casa', 'Live chile', 'produce', now() - interval '1 day');
create function pg_temp.age_product() returns void language plpgsql as $$
begin
  alter table public.products disable trigger products_touch;
  update public.products set updated_at = now() - interval '1 day' where id = 'b4000000-0000-0000-0000-000000000001';
  alter table public.products enable trigger products_touch;
end;
$$;
create function pg_temp.product_touched() returns boolean language sql as $$
  select updated_at > now() - interval '1 minute' from public.products where id = 'b4000000-0000-0000-0000-000000000001'
$$;
do $$ begin
  assert not pg_temp.product_touched(), 'a day old';
  assert (select updated_at is not null from public.products where household_id is null limit 1), 'catalog products have one too';
end $$;
insert into public.product_aliases (product_id, alias, lang) values ('b4000000-0000-0000-0000-000000000001', 'chile vivo', 'es');
do $$ begin assert pg_temp.product_touched(), 'an alias added'; end $$;
select pg_temp.age_product();
delete from public.product_aliases where product_id = 'b4000000-0000-0000-0000-000000000001';
do $$ begin assert pg_temp.product_touched(), 'an alias removed'; end $$;
select pg_temp.age_product();
update public.products set category = 'cupboard' where id = 'b4000000-0000-0000-0000-000000000001';
do $$ begin assert pg_temp.product_touched(), 'the product changed'; end $$;
delete from public.products where id = 'b4000000-0000-0000-0000-000000000001';

select 'LIVE EDITS TESTS PASSED' as result;
