-- Tester feedback (Nov 2026): the Pantry grouped by type of food, and a grocery list about amounts.
--   1. pantry_status also gives each row's family and picto (columns from …13_catalog_looks.sql).
--   2. unplan no longer leaves a "0 g" line: what is left at zero has no amount.
--   3. Typing "leche" on a line a recipe added makes it yours too: taking the recipe off the menu
--      no longer deletes it.

-- New columns go last (create or replace view cannot reorder).
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
       end as state,
       p.family, p.picto
from public.pantry_items s
join public.products p on p.id = s.product_id;

grant select on public.pantry_status to authenticated;

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
      set quantity = v_item.quantity,
          unit = v_item.unit,
          -- Asked for by hand: the line no longer belongs to recipes only.
          source = case when p_source = 'manual' then 'manual'::public.grocery_source else source end
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
        set quantity = nullif(greatest(v_link.item_quantity - v_link.quantity, 0), 0),
            unit = case when v_link.item_quantity - v_link.quantity > 0 then unit end
        where id = v_link.grocery_item_id;
    end if;
  end loop;
  delete from public.up_next where id = p_up_next_id;
end;
$$;
