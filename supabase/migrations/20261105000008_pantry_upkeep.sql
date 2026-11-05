-- Mesa — keeping the pantry true (expert panel, lot 1).
--   pantry_row_at_home   one rule for "at home": not out, not empty, not expired for more than 3 days
--   household_staples    per-household override of products.is_staple ("we don't keep cumin")
--   is_always_have       a staple for this household
--   pantry_has           at home; staples count as at home until marked out
--   pantry_status        (view) every pantry row with its state: ok | soon | check | gone | out
--   ensure_product       a household product for a name the catalog doesn't know
--   pantry_put           the merge rule shared by every way food enters the pantry
--   add_to_pantry        the "+" sheet, starter basics, "I have it"
--   set_pantry_item      level / zone / date corrections from a pantry tile
--   pantry_out           "out", optionally back on the list (works for staples too)
--   set_always_have      "we don't keep it" / "we always have it"
--   always_have_list     the household's staples and whether any is out
--   ingredient_availability  per ingredient of a recipe: at home? use soon?
--   complete_shopping, mark_have, plan_recipe, cook_recipe, recipe_coverage: rewritten on these rules

-- Rules -----------------------------------------------------------------------------------------

-- Food past its date stays "at home" for 3 days (it may still be fine: "Still there?"), then not.
create or replace function public.pantry_row_at_home(p_level public.pantry_level, p_quantity numeric, p_expires_on date)
returns boolean
language sql stable
as $$
  select p_level is distinct from 'out'
     and (p_quantity is null or p_quantity > 0)
     and (p_expires_on is null or p_expires_on >= current_date - 3)
$$;

create or replace function public.default_zone_for(p_category public.category)
returns public.zone
language sql immutable
as $$
  select case
    when p_category in ('produce', 'meat', 'dairy') then 'fridge'::public.zone
    when p_category = 'frozen' then 'freezer'::public.zone
    else 'cupboard'::public.zone
  end
$$;

create table public.household_staples (
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  always_have boolean not null,
  primary key (household_id, product_id)
);
alter table public.household_staples enable row level security;
create policy household_staples_all on public.household_staples for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create or replace function public.is_always_have(p_household uuid, p_product uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce(
    (select s.always_have from public.household_staples s where s.household_id = p_household and s.product_id = p_product),
    (select p.is_staple from public.products p where p.id = p_product),
    false
  )
$$;

create or replace function public.pantry_has(p_household uuid, p_product uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (
           select 1 from public.pantry_items s
           where s.household_id = p_household and s.product_id = p_product
             and public.pantry_row_at_home(s.level, s.quantity, s.expires_on)
         )
      or (public.is_always_have(p_household, p_product)
          and not exists (
            select 1 from public.pantry_items s
            where s.household_id = p_household and s.product_id = p_product
              and (s.level = 'out' or s.quantity = 0)
          ))
$$;

create or replace view public.pantry_status with (security_invoker = true) as
select s.id, s.household_id, s.product_id, s.zone, s.quantity, s.unit, s.level, s.expires_on, s.updated_at,
       p.name_en, p.category, p.shelf_life_days, p.unit_family,
       case
         when s.level = 'out' or s.quantity = 0 then 'out'
         when s.expires_on is null then 'ok'
         when s.expires_on < current_date - 3 then 'gone'
         when s.expires_on < current_date then 'check'
         when s.expires_on <= public.use_soon_by() then 'soon'
         else 'ok'
       end as state
from public.pantry_items s
join public.products p on p.id = s.product_id;

-- Writing to the pantry ----------------------------------------------------------------------------

-- The product for a name: the household's own, the catalog's by exact name, or a new household product.
create or replace function public.ensure_product(p_label text, p_category public.category default 'other')
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_name text := trim(p_label);
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'empty product name' using errcode = '22023';
  end if;
  select id into v_id from public.products
  where (household_id = v_household or household_id is null) and lower(name_en) = lower(v_name)
  order by household_id nulls last
  limit 1;
  if found then
    return v_id;
  end if;
  insert into public.products (household_id, name_en, category, default_zone, unit_family)
  values (v_household, upper(left(v_name, 1)) || substr(v_name, 2), coalesce(p_category, 'other'),
          public.default_zone_for(coalesce(p_category, 'other')), 'count')
  returning id into v_id;
  return v_id;
end;
$$;

-- Puts food in a zone. A fresh purchase replaces the date; a correction ("I have it") keeps what is known.
-- Same-unit amounts add up; anything not at home any more starts over.
create or replace function public.pantry_put(
  p_household uuid,
  p_product uuid,
  p_zone public.zone,
  p_quantity numeric,
  p_unit text,
  p_expires_on date,
  p_fresh boolean
)
returns public.pantry_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.pantry_items;
begin
  insert into public.pantry_items as cur (household_id, product_id, zone, quantity, unit, level, expires_on)
  values (p_household, p_product, p_zone, p_quantity, p_unit, 'full', p_expires_on)
  on conflict (household_id, product_id, zone) do update set
    quantity = case
      when not public.pantry_row_at_home(cur.level, cur.quantity, cur.expires_on) then excluded.quantity
      when cur.quantity is not null and excluded.quantity is not null
           and coalesce(cur.unit, '') = coalesce(excluded.unit, '') then cur.quantity + excluded.quantity
      when excluded.quantity is null and not p_fresh then cur.quantity
      else excluded.quantity
    end,
    unit = case
      when not public.pantry_row_at_home(cur.level, cur.quantity, cur.expires_on) then excluded.unit
      when cur.quantity is not null and excluded.quantity is not null
           and coalesce(cur.unit, '') = coalesce(excluded.unit, '') then cur.unit
      when excluded.quantity is null and not p_fresh then cur.unit
      else excluded.unit
    end,
    level = 'full',
    expires_on = case
      when p_fresh or not public.pantry_row_at_home(cur.level, cur.quantity, cur.expires_on) then excluded.expires_on
      else coalesce(cur.expires_on, excluded.expires_on)
    end
  returning * into v_row;
  return v_row;
end;
$$;

-- p_items = [{ "product_id"?: uuid, "label"?: text, "category"?: category, "zone"?: zone,
--              "quantity"?: number, "unit"?: text, "expires_on"?: date | null, "dated"?: bool }]
-- A label without product becomes a household product. Without "expires_on", "dated" items keep for
-- the product's shelf life from today (typed, likely fresh); others get no date (owned for a while).
create or replace function public.add_to_pantry(p_items jsonb)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_item jsonb;
  v_product_id uuid;
  v_product public.products;
  v_expires date;
  v_count int := 0;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    -- Resolved before reading: a product created by ensure_product is not visible to the statement
    -- that created it.
    v_product_id := coalesce(
      nullif(v_item ->> 'product_id', '')::uuid,
      public.ensure_product(v_item ->> 'label', coalesce((v_item ->> 'category')::public.category, 'other'))
    );
    select * into v_product from public.products where id = v_product_id;
    continue when not found;
    v_expires := case
      when v_item ? 'expires_on' then (v_item ->> 'expires_on')::date
      when coalesce((v_item ->> 'dated')::boolean, false) and v_product.shelf_life_days is not null
        then current_date + v_product.shelf_life_days
      else null
    end;
    perform public.pantry_put(
      v_household,
      v_product.id,
      coalesce((v_item ->> 'zone')::public.zone, v_product.default_zone),
      (v_item ->> 'quantity')::numeric,
      nullif(v_item ->> 'unit', ''),
      v_expires,
      false
    );
    insert into public.pantry_events (household_id, product_id, label, delta, unit, reason)
    values (v_household, v_product.id, v_product.name_en, (v_item ->> 'quantity')::numeric, nullif(v_item ->> 'unit', ''), 'correction');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Corrections from a pantry tile. Moving to a zone that already holds the product merges the two.
-- Returns the row that holds the item afterwards.
create or replace function public.set_pantry_item(
  p_item uuid,
  p_level public.pantry_level default null,
  p_zone public.zone default null,
  p_expires_on date default null,
  p_clear_expiry boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_row public.pantry_items;
begin
  select * into v_row from public.pantry_items where id = p_item for update;
  if not found then
    raise exception 'pantry item not found' using errcode = 'P0002';
  end if;
  if p_level = 'out' then
    raise exception 'use pantry_out' using errcode = '22023';
  end if;

  if p_zone is not null and p_zone <> v_row.zone then
    if exists (select 1 from public.pantry_items
               where household_id = v_row.household_id and product_id = v_row.product_id and zone = p_zone) then
      v_row := public.pantry_put(v_row.household_id, v_row.product_id, p_zone, v_row.quantity, v_row.unit, v_row.expires_on, false);
      delete from public.pantry_items where id = p_item;
    else
      update public.pantry_items set zone = p_zone where id = p_item returning * into v_row;
    end if;
  end if;

  update public.pantry_items set
    level = coalesce(p_level, level),
    quantity = case when p_level is not null and p_level <> 'full' then null else quantity end,
    expires_on = case when p_clear_expiry then null else coalesce(p_expires_on, expires_on) end
  where id = v_row.id
  returning * into v_row;

  insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
  select v_row.household_id, v_row.product_id, p.name_en, null, null, 'correction', v_row.id
  from public.products p where p.id = v_row.product_id;
  return v_row.id;
end;
$$;

-- "Out": every row of the product is used up (a staple gets an "out" row so it stops counting as at
-- home until bought). With p_add_to_list, it goes back on the list; returns that grocery line's id.
create or replace function public.pantry_out(p_product uuid, p_add_to_list boolean default true)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_product public.products;
  v_item public.grocery_items;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;
  select * into v_product from public.products where id = p_product;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  update public.pantry_items set level = 'out', quantity = 0
  where household_id = v_household and product_id = p_product;
  if not found then
    insert into public.pantry_items (household_id, product_id, zone, quantity, level)
    values (v_household, p_product, v_product.default_zone, 0, 'out');
  end if;
  insert into public.pantry_events (household_id, product_id, label, delta, unit, reason)
  values (v_household, p_product, v_product.name_en, null, null, 'correction');
  if not p_add_to_list then
    return null;
  end if;
  v_item := public.add_grocery_item(v_product.name_en, p_product, null, null, v_product.category, 'ran_out');
  return v_item.id;
end;
$$;

create or replace function public.set_always_have(p_product uuid, p_value boolean)
returns void
language sql
set search_path = public
as $$
  insert into public.household_staples (household_id, product_id, always_have)
  values (public.current_household_id(), p_product, p_value)
  on conflict (household_id, product_id) do update set always_have = excluded.always_have
$$;

-- The household's staples (catalog staples unless turned off, plus its own), and whether each is out.
create or replace function public.always_have_list()
returns table (product_id uuid, name text, category public.category, is_out boolean)
language sql stable
set search_path = public
as $$
  select p.id, p.name_en, p.category, not public.pantry_has(public.current_household_id(), p.id)
  from public.products p
  where (p.household_id is null or p.household_id = public.current_household_id())
    and public.is_always_have(public.current_household_id(), p.id)
  order by p.name_en
$$;

-- Reading for recipes ----------------------------------------------------------------------------

create or replace function public.ingredient_availability(p_recipe_id uuid)
returns table (ingredient_id uuid, at_home boolean, soon boolean, always_have boolean)
language sql stable
set search_path = public
as $$
  select i.id,
         i.product_id is not null and public.pantry_has(r.household_id, i.product_id),
         coalesce((select min(s.expires_on) from public.pantry_items s
                   where s.household_id = r.household_id and s.product_id = i.product_id
                     and public.pantry_row_at_home(s.level, s.quantity, s.expires_on)
                  ) between current_date and public.use_soon_by(), false),
         i.product_id is not null and public.is_always_have(r.household_id, i.product_id)
  from public.recipe_ingredients i
  join public.recipes r on r.id = i.recipe_id
  where i.recipe_id = p_recipe_id
$$;

create or replace function public.recipe_coverage()
returns table (recipe_id uuid, have_count int, need_count int, pantry_count int, soon_names text[])
language sql stable
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
           i.product_id is not null and public.pantry_has(r.household_id, i.product_id) as at_home,
           i.product_id is not null and public.is_always_have(r.household_id, i.product_id) as always,
           (select min(s.expires_on) from public.pantry_items s
            where s.household_id = r.household_id and s.product_id = i.product_id
              and public.pantry_row_at_home(s.level, s.quantity, s.expires_on)) as soonest
    from public.recipe_ingredients i
    left join public.products p on p.id = i.product_id
    where i.recipe_id = r.id and not i.is_optional
  ) x on true
  where r.household_id = public.current_household_id()
  group by r.id
$$;

-- Rewritten on the new rules -----------------------------------------------------------------------

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
    select i.*, p.name_en as product_name, p.category as product_category
    from public.recipe_ingredients i
    left join public.products p on p.id = i.product_id
    where i.recipe_id = v_recipe.id and not i.is_optional
    order by i.position
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

create or replace function public.mark_have(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_item public.grocery_items;
  v_product uuid;
begin
  update public.grocery_items set status = 'removed'
  where id = p_item_id and status in ('to_buy', 'in_cart')
  returning * into v_item;
  if not found then
    return;
  end if;
  v_product := coalesce(v_item.product_id, public.ensure_product(v_item.label, v_item.category));
  insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
  values (v_item.household_id, v_product, v_item.label, null, null, 'have', v_item.id);
  perform public.pantry_put(v_item.household_id, v_product,
                            (select default_zone from public.products where id = v_product), null, null, null, false);
end;
$$;

create or replace function public.complete_shopping(p_put_away jsonb default null)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_item record;
  v_product_id uuid;
  v_product public.products;
  v_choice jsonb;
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
    select e into v_choice
    from jsonb_array_elements(coalesce(p_put_away, '[]'::jsonb)) e
    where e ->> 'id' = v_item.id::text
    limit 1;

    -- Things the catalog doesn't know become the household's own products, so they are put away too.
    v_product_id := coalesce(v_item.product_id, public.ensure_product(v_item.label, v_item.category));
    select * into v_product from public.products where id = v_product_id;
    if v_item.product_id is null then
      update public.grocery_items set product_id = v_product.id where id = v_item.id;
    end if;

    insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
    values (v_household, v_product.id, v_item.label, v_item.quantity, v_item.unit, 'purchase', v_item.id);

    v_expires := case
      when v_choice ? 'expires_on' then (v_choice ->> 'expires_on')::date
      when v_product.shelf_life_days is null then null
      else current_date + v_product.shelf_life_days
    end;
    perform public.pantry_put(v_household, v_product.id,
                              coalesce((v_choice ->> 'zone')::public.zone, v_product.default_zone),
                              v_item.quantity, v_item.unit, v_expires, true);
  end loop;

  return v_count;
end;
$$;

-- Cooked!: as before, on the new rules (staples of this household are not tracked).
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
    where i.recipe_id = v_recipe.id and not i.is_optional and not public.is_always_have(v_household, p.id)
    order by i.position
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

-- Permissions -------------------------------------------------------------------------------------

grant select on public.pantry_status to authenticated;
grant execute on function
  public.pantry_row_at_home(public.pantry_level, numeric, date),
  public.default_zone_for(public.category),
  public.is_always_have(uuid, uuid),
  public.pantry_has(uuid, uuid),
  public.ensure_product(text, public.category),
  public.pantry_put(uuid, uuid, public.zone, numeric, text, date, boolean),
  public.add_to_pantry(jsonb),
  public.set_pantry_item(uuid, public.pantry_level, public.zone, date, boolean),
  public.pantry_out(uuid, boolean),
  public.set_always_have(uuid, boolean),
  public.always_have_list(),
  public.ingredient_availability(uuid),
  public.recipe_coverage(),
  public.plan_recipe(uuid, int),
  public.mark_have(uuid),
  public.complete_shopping(jsonb),
  public.cook_recipe(uuid, int)
to authenticated;
