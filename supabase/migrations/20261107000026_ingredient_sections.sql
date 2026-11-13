-- Ingredient sections, and one product counted once per recipe (Nov 2026).
--   1. recipe_ingredients.section: the part of the recipe a line belongs to, as the recipe names it
--      ("Marinade", "Sauce", "Noodles"); null for a recipe with one list. Lines of a section follow each
--      other (position). The import reads it from the source; the editor writes it as a heading line
--      ending with ":" (packages/shared/src/sections.ts).
--   2. A recipe that uses a product in several sections (dark soy sauce in the marinade, the sauce and
--      the noodles) counts it once: what is at home and what is left to buy (recipe_coverage), what
--      Cooked! takes from the pantry (cook_recipe: once, with the amounts added up), and the grocery line
--      planning it adds (plan_recipe). Before, Cooked! took a bottle down three steps for three lines.
--      Amounts are added up when every line has one in the same unit; otherwise none is given.

-- 1. Sections ---------------------------------------------------------------------------------------------

alter table public.recipe_ingredients add column if not exists section text;
alter table public.recipe_ingredients drop constraint if exists recipe_ingredients_section;
alter table public.recipe_ingredients add constraint recipe_ingredients_section
  check (section is null or (section = btrim(section) and length(section) between 1 and 60));

-- 2. One product once -------------------------------------------------------------------------------------

-- The recipe's lines with one row per product (lines without a product stay one each), in recipe order:
-- the summed amount when every line has one in the same unit, else none.
create or replace function public.recipe_needs(p_recipe uuid)
returns table (product_id uuid, name text, quantity numeric, unit text, first_position int)
language sql
stable
set search_path = public
as $$
  select (array_agg(i.product_id))[1],
         (array_agg(i.name order by i.position))[1],
         case when count(*) = count(i.quantity)
                   and count(distinct coalesce(nullif(i.unit, ''), 'unit')) = 1
              then sum(i.quantity) end,
         case when count(distinct coalesce(nullif(i.unit, ''), 'unit')) = 1 then min(i.unit) end,
         min(i.position)
  from public.recipe_ingredients i
  where i.recipe_id = p_recipe and not i.is_optional
  group by coalesce(i.product_id, i.id)
$$;

create or replace function public.recipe_coverage()
returns table (recipe_id uuid, have_count int, need_count int, pantry_count int, soon_names text[])
language sql
stable
set search_path = public
as $$
  select r.id,
         (count(*) filter (where x.at_home))::int,
         (count(*) filter (where not x.at_home))::int,
         (count(*) filter (where x.at_home and not x.always))::int,
         coalesce(array_agg(x.name_en order by x.soonest)
                    filter (where x.at_home and not x.always and x.soonest between current_date and public.use_soon_by()), '{}')
  from public.recipes r
  join lateral (
    select p.name_en,
           n.product_id is not null and public.pantry_has(r.household_id, n.product_id) as at_home,
           n.product_id is not null and public.is_always_have(r.household_id, n.product_id) as always,
           (select min(s.expires_on) from public.pantry_items s
            where s.household_id = r.household_id and s.product_id = n.product_id
              and public.pantry_row_at_home(s.level, s.quantity, s.expires_on)) as soonest
    from public.recipe_needs(r.id) n
    left join public.products p on p.id = n.product_id
  ) x on true
  where r.household_id = public.current_household_id()
  group by r.id
$$;

create or replace function public.plan_recipe(p_recipe_id uuid, p_servings int default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_recipe public.recipes;
  v_servings int;
  v_up_next uuid;
  v_ing record;
  v_qty numeric;
  v_item public.grocery_items;
begin
  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;

  v_servings := coalesce(p_servings,
                         (select default_servings from public.households where id = v_household),
                         v_recipe.servings);

  insert into public.up_next (household_id, recipe_id, servings)
  values (v_household, v_recipe.id, v_servings)
  returning id into v_up_next;

  for v_ing in
    select n.*, p.name_en as product_name, p.category as product_category
    from public.recipe_needs(v_recipe.id) n
    left join public.products p on p.id = n.product_id
    order by n.first_position
  loop
    continue when v_ing.product_id is not null and public.pantry_has(v_household, v_ing.product_id);
    v_qty := public.round_for_shopping(v_ing.quantity * v_servings / v_recipe.servings, v_ing.unit);
    v_item := public.add_grocery_item(
      coalesce(v_ing.product_name, v_ing.name),
      v_ing.product_id,
      v_qty,
      v_ing.unit,
      coalesce(v_ing.product_category, 'other'),
      'recipe'
    );
    insert into public.grocery_item_recipes (grocery_item_id, up_next_id, recipe_title, quantity, unit)
    values (v_item.id, v_up_next, v_recipe.title, v_qty, v_ing.unit)
    on conflict (grocery_item_id, up_next_id) do update
      set quantity = coalesce(public.grocery_item_recipes.quantity, 0) + coalesce(excluded.quantity, 0);
  end loop;

  return v_up_next;
end;
$$;

create or replace function public.cook_recipe(p_recipe_id uuid, p_servings int default null)
returns table (product_id uuid, label text, category public.category, used numeric, unit text,
               left_quantity numeric, left_level public.pantry_level, ran_out boolean, saved boolean)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  v_household uuid := public.current_household_id();
  v_recipe public.recipes;
  v_servings int;
  v_ing record;
  v_stock public.pantry_items;
  v_need numeric;
  v_left numeric;
  v_level public.pantry_level;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;
  select * into v_recipe from public.recipes r where r.id = p_recipe_id;
  if not found then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  v_servings := coalesce(p_servings,
                         (select h.default_servings from public.households h where h.id = v_household),
                         v_recipe.servings);

  -- Each product once, with what all its lines use together.
  for v_ing in
    select n.product_id as pid, n.quantity as qty, n.unit as ing_unit, p.name_en, p.category as cat
    from public.recipe_needs(v_recipe.id) n
    join public.products p on p.id = n.product_id
    where not public.is_always_have(v_household, p.id)
    order by n.first_position
  loop
    select * into v_stock from public.pantry_items s
    where s.household_id = v_household and s.product_id = v_ing.pid
      and public.pantry_row_at_home(s.level, s.quantity, s.expires_on)
    order by s.expires_on nulls last, s.updated_at
    limit 1
    for update;
    continue when not found;

    v_need := v_ing.qty * v_servings / v_recipe.servings;
    if v_need is not null and v_stock.quantity is not null
       and coalesce(nullif(v_stock.unit, ''), 'unit') = coalesce(nullif(v_ing.ing_unit, ''), 'unit') then
      v_left := greatest(v_stock.quantity - v_need, 0);
      v_level := greatest(
        coalesce(v_stock.level, 'full'),
        case
          when v_left = 0 then 'out'
          when v_left <= v_stock.quantity * 0.25 then 'low'
          when v_left <= v_stock.quantity * 0.6 then 'half'
          else 'full'
        end::public.pantry_level
      );
    else
      v_left := null;
      v_level := case coalesce(v_stock.level, 'full')
        when 'full' then 'half'::public.pantry_level
        when 'half' then 'low'::public.pantry_level
        else 'out'::public.pantry_level
      end;
    end if;

    update public.pantry_items s
      set quantity = case when v_level = 'out' then 0 else v_left end, level = v_level
      where s.id = v_stock.id;

    insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
    values (v_household, v_ing.pid, v_ing.name_en, -v_need, v_ing.ing_unit, 'cook', v_recipe.id);

    if v_level = 'out' then
      perform public.add_grocery_item(v_ing.name_en, v_ing.pid, null, null, v_ing.cat, 'ran_out');
    end if;

    product_id := v_ing.pid;
    label := v_ing.name_en;
    category := v_ing.cat;
    used := v_need;
    unit := v_ing.ing_unit;
    left_quantity := case when v_level = 'out' then 0 else v_left end;
    left_level := v_level;
    ran_out := v_level = 'out';
    saved := v_stock.expires_on is not null and v_stock.expires_on <= public.use_soon_by();
    return next;
  end loop;

  delete from public.up_next u
  where u.id = (select o.id from public.up_next o
                where o.household_id = v_household and o.recipe_id = v_recipe.id
                order by o.created_at limit 1);
  update public.recipes r set last_cooked_at = now() where r.id = v_recipe.id;
end;
$$;
