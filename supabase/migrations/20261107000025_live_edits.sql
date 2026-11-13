-- Edits that reach the other phone, and a catalog the worker can trust (Nov 2026).
--   1. Writing a recipe's ingredient lines or steps (the editor, an import, a reread, repair_vague_products)
--      bumps recipes.updated_at once per statement: live sync listens to recipes, not to their lines.
--   2. products.updated_at: bumped on every change of a product and of its aliases. The worker keeps each
--      household's products in a small cache and reloads them when their count or latest updated_at moved.

-- 1. Recipes touched by their lines and steps -----------------------------------------------------------

create or replace function public.touch_recipes_of_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.recipes set updated_at = now() where id in (select distinct recipe_id from new_rows);
  elsif tg_op = 'UPDATE' then
    update public.recipes set updated_at = now()
      where id in (select recipe_id from new_rows union select recipe_id from old_rows);
  else
    -- A recipe deleted with its lines is gone already: nothing to touch.
    update public.recipes set updated_at = now() where id in (select distinct recipe_id from old_rows);
  end if;
  return null;
end;
$$;
revoke execute on function public.touch_recipes_of_rows() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['recipe_ingredients', 'recipe_steps'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_recipe_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch_recipe_upd', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch_recipe_del', t);
    execute format('create trigger %I after insert on public.%I referencing new table as new_rows
                    for each statement execute function public.touch_recipes_of_rows()', t || '_touch_recipe_ins', t);
    execute format('create trigger %I after update on public.%I referencing old table as old_rows new table as new_rows
                    for each statement execute function public.touch_recipes_of_rows()', t || '_touch_recipe_upd', t);
    execute format('create trigger %I after delete on public.%I referencing old table as old_rows
                    for each statement execute function public.touch_recipes_of_rows()', t || '_touch_recipe_del', t);
  end loop;
end
$$;

-- 2. When a household's products last changed -------------------------------------------------------------

alter table public.products add column if not exists updated_at timestamptz not null default now();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create index if not exists products_household_updated on public.products (household_id, updated_at desc)
  where household_id is not null;

-- An alias added or removed changes what the product matches.
create or replace function public.touch_products_of_aliases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.products set updated_at = now() where id in (select distinct product_id from new_rows);
  elsif tg_op = 'UPDATE' then
    update public.products set updated_at = now()
      where id in (select product_id from new_rows union select product_id from old_rows);
  else
    update public.products set updated_at = now() where id in (select distinct product_id from old_rows);
  end if;
  return null;
end;
$$;
revoke execute on function public.touch_products_of_aliases() from public, anon, authenticated;

drop trigger if exists product_aliases_touch_ins on public.product_aliases;
drop trigger if exists product_aliases_touch_upd on public.product_aliases;
drop trigger if exists product_aliases_touch_del on public.product_aliases;
create trigger product_aliases_touch_ins after insert on public.product_aliases referencing new table as new_rows
  for each statement execute function public.touch_products_of_aliases();
create trigger product_aliases_touch_upd after update on public.product_aliases referencing old table as old_rows new table as new_rows
  for each statement execute function public.touch_products_of_aliases();
create trigger product_aliases_touch_del after delete on public.product_aliases referencing old table as old_rows
  for each statement execute function public.touch_products_of_aliases();
