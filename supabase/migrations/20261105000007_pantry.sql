-- Mesa — step 2: the pantry drives planning, cooking and ideas.
--   pantry_has         is a product at home (not used up)?
--   use_soon_by        the date before which food at home should be used ("use soon")
--   plan_recipe        now skips what is already at home
--   mark_have          "Already have" also revives a product that was marked out
--   complete_shopping  takes where each item goes and until when (the "Put away" sheet)
--   cook_recipe        "Cooked!": takes the ingredients out of the pantry and says what it took
--   recipe_coverage    per recipe: what is at home, what to buy, what it would use up soon

-- A product counts as "at home" unless it is marked out or its quantity reached zero.
create or replace function public.pantry_has(p_household uuid, p_product uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1 from public.pantry_items
    where household_id = p_household and product_id = p_product
      and level is distinct from 'out'
      and (quantity is null or quantity > 0)
  )
$$;

-- Food expiring on or before this date should be used soon. The app mirrors it (USE_SOON_DAYS).
create or replace function public.use_soon_by()
returns date
language sql stable
as $$
  select current_date + 3
$$;

-- "Plan it": puts a recipe in Up next and adds what is missing to the list.
-- Staples and what is already at home are skipped.
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
    select i.*, p.name_en as product_name, p.category as product_category, coalesce(p.is_staple, false) as staple
    from public.recipe_ingredients i
    left join public.products p on p.id = i.product_id
    where i.recipe_id = v_recipe.id and not i.is_optional
    order by i.position
  loop
    continue when v_ing.staple;
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

-- "Already have it": takes the item off the list and remembers we have it.
create or replace function public.mark_have(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_item public.grocery_items;
  v_zone public.zone;
begin
  update public.grocery_items set status = 'removed'
  where id = p_item_id and status in ('to_buy', 'in_cart')
  returning * into v_item;
  if not found then
    return;
  end if;

  insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
  values (v_item.household_id, v_item.product_id, v_item.label, null, null, 'have', v_item.id);

  if v_item.product_id is not null then
    select default_zone into v_zone from public.products where id = v_item.product_id;
    insert into public.pantry_items (household_id, product_id, zone, level)
    values (v_item.household_id, v_item.product_id, coalesce(v_zone, 'cupboard'), 'full')
    on conflict (household_id, product_id, zone) do update set
      level = case when public.pantry_items.level is null or public.pantry_items.level = 'out' then 'full'
                   else public.pantry_items.level end,
      quantity = case when public.pantry_items.quantity = 0 then null else public.pantry_items.quantity end;
  end if;
end;
$$;

-- "Done shopping": every in_cart item becomes bought and goes to the pantry.
-- p_put_away = [{"id": "<grocery item id>", "zone": "fridge", "expires_on": "2026-11-12" | null}]
-- overrides where an item goes and until when (null = keeps); items it leaves out use the
-- product's default zone and shelf life.
drop function if exists public.complete_shopping();
create or replace function public.complete_shopping(p_put_away jsonb default null)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_item record;
  v_product public.products;
  v_choice jsonb;
  v_zone public.zone;
  v_expires date;
  v_count int := 0;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;

  for v_item in
    update public.grocery_items g
      set status = 'bought', bought_at = now()
      where g.household_id = v_household and g.status = 'in_cart'
      returning g.*
  loop
    v_count := v_count + 1;
    insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
    values (v_household, v_item.product_id, v_item.label, v_item.quantity, v_item.unit, 'purchase', v_item.id);

    continue when v_item.product_id is null;
    select * into v_product from public.products where id = v_item.product_id;
    continue when not found;

    select e into v_choice
    from jsonb_array_elements(coalesce(p_put_away, '[]'::jsonb)) e
    where e ->> 'id' = v_item.id::text
    limit 1;
    v_zone := coalesce((v_choice ->> 'zone')::public.zone, v_product.default_zone);
    v_expires := case
      when v_choice ? 'expires_on' then (v_choice ->> 'expires_on')::date
      when v_product.shelf_life_days is null then null
      else current_date + v_product.shelf_life_days
    end;

    insert into public.pantry_items (household_id, product_id, zone, quantity, unit, level, expires_on)
    values (v_household, v_product.id, v_zone, v_item.quantity, v_item.unit, 'full', v_expires)
    on conflict (household_id, product_id, zone) do update set
      quantity = case
        when public.pantry_items.quantity is not null and excluded.quantity is not null
             and coalesce(public.pantry_items.unit, '') = coalesce(excluded.unit, '')
          then public.pantry_items.quantity + excluded.quantity
        else excluded.quantity
      end,
      unit = case
        when public.pantry_items.quantity is not null and excluded.quantity is not null
             and coalesce(public.pantry_items.unit, '') = coalesce(excluded.unit, '')
          then public.pantry_items.unit
        else excluded.unit
      end,
      level = 'full',
      expires_on = excluded.expires_on;
  end loop;

  return v_count;
end;
$$;

-- "Cooked!": takes each ingredient that is at home out of the pantry (soonest to expire first),
-- puts what ran out back on the list, leaves Up next and remembers the date.
-- Amounts in the same unit are subtracted and the level follows what is left (≤ 60 % half, ≤ 25 % low,
-- never back up); otherwise one cook uses up one level (full → half → low → out).
create or replace function public.cook_recipe(p_recipe_id uuid, p_servings int default null)
returns table (
  product_id uuid,
  label text,
  category public.category,
  used numeric,
  unit text,
  left_quantity numeric,
  left_level public.pantry_level,
  ran_out boolean,
  saved boolean
)
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

  for v_ing in
    select i.product_id as pid, i.quantity as qty, i.unit as ing_unit, p.name_en, p.category as cat
    from public.recipe_ingredients i
    join public.products p on p.id = i.product_id
    where i.recipe_id = v_recipe.id and not i.is_optional and not p.is_staple
    order by i.position
  loop
    select * into v_stock from public.pantry_items s
    where s.household_id = v_household and s.product_id = v_ing.pid
      and s.level is distinct from 'out' and (s.quantity is null or s.quantity > 0)
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

-- For each recipe of the household (non-optional ingredients only):
--   have_count    staples + what is at home
--   need_count    what "Plan it" would add to the list
--   pantry_count  non-staples already at home ("Uses 3 things you have")
--   soon_names    those of them to use soon, soonest first
create or replace function public.recipe_coverage()
returns table (recipe_id uuid, have_count int, need_count int, pantry_count int, soon_names text[])
language sql stable
set search_path = public
as $$
  select r.id,
         (count(*) filter (where x.staple or x.at_home))::int,
         (count(*) filter (where not x.staple and not x.at_home))::int,
         (count(*) filter (where not x.staple and x.at_home))::int,
         coalesce(array_agg(x.name_en order by x.expires_on)
                    filter (where not x.staple and x.at_home and x.expires_on <= public.use_soon_by()), '{}')
  from public.recipes r
  join lateral (
    select coalesce(p.is_staple, false) as staple,
           p.name_en,
           stock.found is not null as at_home,
           stock.expires_on
    from public.recipe_ingredients i
    left join public.products p on p.id = i.product_id
    left join lateral (
      select true as found, min(s.expires_on) as expires_on
      from public.pantry_items s
      where s.household_id = r.household_id and s.product_id = i.product_id
        and s.level is distinct from 'out' and (s.quantity is null or s.quantity > 0)
      having count(*) > 0
    ) stock on true
    where i.recipe_id = r.id and not i.is_optional
  ) x on true
  where r.household_id = public.current_household_id()
  group by r.id
$$;

-- Permissions -------------------------------------------------------------------

grant execute on function
  public.pantry_has(uuid, uuid),
  public.use_soon_by(),
  public.plan_recipe(uuid, int),
  public.mark_have(uuid),
  public.complete_shopping(jsonb),
  public.cook_recipe(uuid, int),
  public.recipe_coverage()
to authenticated;
