-- Business functions called by the app (supabase.rpc) and the import worker.
-- Household functions are SECURITY DEFINER with explicit checks; the rest run
-- as the caller so row level security still applies.

-- Households --------------------------------------------------------------------

create or replace function public.create_household(p_name text default 'Home')
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if public.current_household_id() is not null then
    raise exception 'already in a household' using errcode = 'P0001';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Home'))
  returning id into v_household;
  insert into public.profiles (id, household_id) values (auth.uid(), v_household)
  on conflict (id) do update set household_id = excluded.household_id;
  return v_household;
end;
$$;

create or replace function public.create_invite()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.invites (code, household_id) values (v_code, v_household);
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  return v_code;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select household_id into v_household
  from public.invites
  where code = upper(trim(p_code)) and expires_at > now();
  if v_household is null then
    raise exception 'invalid or expired code' using errcode = 'P0002';
  end if;
  insert into public.profiles (id, household_id) values (auth.uid(), v_household)
  on conflict (id) do update set household_id = excluded.household_id;
  return v_household;
end;
$$;

-- Groceries -------------------------------------------------------------------

-- Adds an item to the list, merging with an existing to_buy line for the same
-- product (or the same label when no product is known).
create or replace function public.add_grocery_item(
  p_label text,
  p_product_id uuid default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_category public.category default 'other',
  p_source public.grocery_source default 'manual'
)
returns public.grocery_items
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_item public.grocery_items;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;

  select * into v_item from public.grocery_items g
  where g.household_id = v_household
    and g.status = 'to_buy'
    and (
      (p_product_id is not null and g.product_id = p_product_id)
      or (p_product_id is null and g.product_id is null and lower(trim(g.label)) = lower(trim(p_label)))
    )
  order by g.created_at
  limit 1
  for update;

  if found then
    if p_quantity is not null and v_item.quantity is not null
       and coalesce(v_item.unit, '') = coalesce(p_unit, '') then
      v_item.quantity := v_item.quantity + p_quantity;
    elsif v_item.quantity is null and p_quantity is not null then
      v_item.quantity := p_quantity;
      v_item.unit := p_unit;
    end if;
    update public.grocery_items
      set quantity = v_item.quantity, unit = v_item.unit
      where id = v_item.id
      returning * into v_item;
    return v_item;
  end if;

  insert into public.grocery_items (household_id, label, product_id, quantity, unit, category, source)
  values (v_household, trim(p_label), p_product_id, p_quantity, p_unit, coalesce(p_category, 'other'), coalesce(p_source, 'manual'))
  returning * into v_item;
  return v_item;
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
    on conflict (household_id, product_id, zone) do update set level = coalesce(public.pantry_items.level, 'full');
  end if;
end;
$$;

-- "Done shopping": every in_cart item becomes bought and goes to the pantry.
create or replace function public.complete_shopping()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_item record;
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

    if v_item.product_id is not null then
      insert into public.pantry_items (household_id, product_id, zone, quantity, unit, level, expires_on)
      select v_household, p.id, p.default_zone, v_item.quantity, v_item.unit, 'full',
             case when p.shelf_life_days is null then null else current_date + p.shelf_life_days end
      from public.products p where p.id = v_item.product_id
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
    end if;
  end loop;

  return v_count;
end;
$$;

-- Products bought most often lately and not on the list right now.
create or replace function public.usual_products(p_limit int default 8)
returns table (product_id uuid, name_en text, category public.category, times bigint)
language sql stable
set search_path = public
as $$
  select p.id, p.name_en, p.category, count(*) as times
  from public.pantry_events e
  join public.products p on p.id = e.product_id
  where e.household_id = public.current_household_id()
    and e.reason = 'purchase'
    and e.created_at > now() - interval '120 days'
    and not exists (
      select 1 from public.grocery_items g
      where g.household_id = e.household_id and g.product_id = p.id and g.status in ('to_buy', 'in_cart')
    )
  group by p.id, p.name_en, p.category
  order by count(*) desc, max(e.created_at) desc
  limit greatest(1, least(p_limit, 30))
$$;

-- Up next ---------------------------------------------------------------------

create or replace function public.round_for_shopping(p_quantity numeric, p_unit text)
returns numeric
language sql immutable
as $$
  select case
    when p_quantity is null then null
    when p_unit is null or p_unit in ('unit', 'can', 'pack', 'bunch', 'clove', 'slice') then ceil(p_quantity)
    when p_unit in ('g', 'ml') then ceil(p_quantity)
    else round(p_quantity, 2)
  end
$$;

-- "Plan it": puts a recipe in Up next and adds its ingredients to the list.
-- Step 1 does not subtract the pantry; staples are skipped; the person swipes
-- "Already have" on what is at home.
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

-- Takes a recipe out of Up next and removes what it alone added to the list.
create or replace function public.unplan(p_up_next_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link record;
begin
  for v_link in
    select l.*, g.status, g.quantity as item_quantity, g.unit as item_unit,
           (select count(*) from public.grocery_item_recipes o
             where o.grocery_item_id = l.grocery_item_id and o.up_next_id <> l.up_next_id) as other_links,
           g.source
    from public.grocery_item_recipes l
    join public.grocery_items g on g.id = l.grocery_item_id
    where l.up_next_id = p_up_next_id
  loop
    continue when v_link.status <> 'to_buy';
    if v_link.other_links = 0 and v_link.source = 'recipe' then
      delete from public.grocery_items where id = v_link.grocery_item_id;
    elsif v_link.quantity is not null and v_link.item_quantity is not null
          and coalesce(v_link.unit, '') = coalesce(v_link.item_unit, '') then
      update public.grocery_items
        set quantity = greatest(v_link.item_quantity - v_link.quantity, 0)
        where id = v_link.grocery_item_id;
    end if;
  end loop;
  delete from public.up_next where id = p_up_next_id;
end;
$$;

-- Step 1 "cooked": the recipe leaves Up next and remembers when it was cooked.
-- Pantry deduction arrives in step 2.
create or replace function public.mark_cooked(p_up_next_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_recipe uuid;
begin
  delete from public.up_next where id = p_up_next_id returning recipe_id into v_recipe;
  if v_recipe is not null then
    update public.recipes set last_cooked_at = now() where id = v_recipe;
  end if;
end;
$$;

-- Imports (worker only) -------------------------------------------------------

create or replace function public.claim_import_job()
returns setof public.import_jobs
language plpgsql
set search_path = public
as $$
begin
  -- put back jobs that a crashed worker left behind
  update public.import_jobs
    set status = 'queued'
    where status = 'processing' and started_at < now() - interval '10 minutes' and attempts < 3;
  update public.import_jobs
    set status = 'failed', error = coalesce(error, 'timed out'), finished_at = now()
    where status = 'processing' and started_at < now() - interval '10 minutes' and attempts >= 3;

  return query
    update public.import_jobs j
      set status = 'processing', started_at = now(), attempts = j.attempts + 1
      where j.id = (
        select id from public.import_jobs
        where status = 'queued'
        order by created_at
        for update skip locked
        limit 1
      )
      returning j.*;
end;
$$;

-- Permissions -------------------------------------------------------------------

revoke execute on function public.claim_import_job() from public, anon, authenticated;
grant execute on function public.claim_import_job() to service_role;

revoke execute on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated, service_role;

grant execute on function
  public.create_household(text),
  public.create_invite(),
  public.join_household(text),
  public.add_grocery_item(text, uuid, numeric, text, public.category, public.grocery_source),
  public.mark_have(uuid),
  public.complete_shopping(),
  public.usual_products(int),
  public.plan_recipe(uuid, int),
  public.unplan(uuid),
  public.mark_cooked(uuid)
to authenticated;
