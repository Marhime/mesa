-- Amounts you can correct (Nov 2026, after the first real fridge scan):
--   1. set_pantry_quantity: "2 pcs", "500 g" on a pantry row (the tile sheet only had Full / Half / Low).
--   2. apply_pantry_proposal takes the amounts corrected in the review sheet (p_edits), and a scan's amount
--      replaces what was there instead of adding to it (6 eggs + "2 left" was 8).

-- Unit codes stored (see 20261105000001_schema.sql); null = no unit.
create or replace function public.is_unit_code(p_unit text)
returns boolean
language sql
immutable
as $$
  select p_unit is null
      or p_unit in ('g', 'ml', 'unit', 'tbsp', 'tsp', 'cup', 'can', 'bunch', 'pack', 'clove', 'pinch', 'slice')
$$;

-- The exact amount of one pantry row. A null quantity clears it (back to Full / Half / Low only).
-- An amount makes the row "full" (the amount is the truth; Half / Low clear it, see set_pantry_item).
-- Zero is "out": the app calls pantry_out for that.
create or replace function public.set_pantry_quantity(p_item uuid, p_quantity numeric, p_unit text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_before public.pantry_items;
  v_row public.pantry_items;
begin
  if p_quantity is not null and p_quantity <= 0 then
    raise exception 'use pantry_out' using errcode = '22023';
  end if;
  if not public.is_unit_code(p_unit) then
    raise exception 'unknown unit %', p_unit using errcode = '22023';
  end if;
  select * into v_before from public.pantry_items where id = p_item for update;
  if not found then
    raise exception 'pantry item not found' using errcode = 'P0002';
  end if;

  update public.pantry_items set
    quantity = p_quantity,
    unit = case when p_quantity is null then null else p_unit end,
    level = case when p_quantity is null then level else 'full' end,
    updated_at = now()
  where id = p_item
  returning * into v_row;

  insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
  select v_row.household_id, v_row.product_id, p.name_en,
         case when v_before.quantity is not null and p_quantity is not null
                   and coalesce(v_before.unit, '') = coalesce(p_unit, '')
              then p_quantity - v_before.quantity end,
         p_unit, 'correction', v_row.id
  from public.products p where p.id = v_row.product_id;
  return v_row.id;
end;
$$;

-- Applies the ticked lines of a proposal (once), with the amounts corrected in the review
-- (p_edits: [{"id": line id, "quantity": number | null, "unit": text | null}]). Returns how many lines changed something.
drop function if exists public.apply_pantry_proposal(uuid, uuid[]);
create function public.apply_pantry_proposal(p_proposal_id uuid, p_line_ids uuid[], p_edits jsonb default '[]'::jsonb)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_proposal public.pantry_proposals;
  v_line public.pantry_proposal_lines;
  v_edit jsonb;
  v_product_id uuid;
  v_product public.products;
  v_zone public.zone;
  v_expires date;
  v_count int := 0;
begin
  select * into v_proposal from public.pantry_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if v_proposal.status <> 'pending' then
    return 0;
  end if;

  for v_line in
    select * from public.pantry_proposal_lines
    where proposal_id = p_proposal_id and id = any(coalesce(p_line_ids, '{}'))
    order by position
  loop
    -- The amount the person corrected wins over the one read from the photo.
    select e into v_edit from jsonb_array_elements(coalesce(p_edits, '[]'::jsonb)) e
    where e->>'id' = v_line.id::text limit 1;
    if v_edit is not null then
      v_line.quantity := nullif(v_edit->>'quantity', '')::numeric;
      v_line.unit := case when v_line.quantity is null then null else v_edit->>'unit' end;
      if v_line.quantity is not null and v_line.quantity < 0 then
        raise exception 'negative amount' using errcode = '22023';
      end if;
      if not public.is_unit_code(v_line.unit) then
        raise exception 'unknown unit %', v_line.unit using errcode = '22023';
      end if;
      -- A counted amount replaces a rough level read from the photo.
      if v_line.quantity is not null then
        v_line.level := 'full';
      end if;
    end if;

    -- "0" on a receipt line: it was not bought after all.
    continue when v_line.action = 'bought' and v_line.quantity = 0;

    v_product_id := coalesce(v_line.product_id, public.ensure_product(v_line.label, v_line.category));
    select * into v_product from public.products where id = v_product_id;
    v_zone := coalesce(v_line.zone, v_proposal.zone, v_product.default_zone);

    if v_line.action = 'out' or (v_line.action in ('add', 'update') and v_line.quantity = 0) then
      perform public.pantry_out(v_product_id, false);
    elsif v_line.action in ('add', 'update') then
      perform public.pantry_put(v_household, v_product_id, v_zone, v_line.quantity, v_line.unit, v_line.expires_on, false);
      -- What the camera (or the person) sees is what is there now: it replaces, it does not add.
      if v_line.quantity is not null or (v_line.level is not null and v_line.level <> 'full') then
        update public.pantry_items set
          level = coalesce(v_line.level, 'full'),
          quantity = v_line.quantity,
          unit = case when v_line.quantity is null then unit else v_line.unit end
        where household_id = v_household and product_id = v_product_id and zone = v_zone;
      end if;
      insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id)
      values (v_household, v_product_id, v_product.name_en, v_line.quantity, v_line.unit, 'correction', p_proposal_id);
    else -- bought
      if v_line.grocery_item_id is not null then
        update public.grocery_items
          set status = 'bought', bought_at = now(), product_id = coalesce(product_id, v_product_id),
              quantity = coalesce(v_line.quantity, quantity), unit = case when v_line.quantity is null then unit else v_line.unit end
          where id = v_line.grocery_item_id and status in ('to_buy', 'in_cart');
      end if;
      v_expires := coalesce(v_line.expires_on,
                            case when v_product.shelf_life_days is null or v_zone = 'freezer' then null
                                 else current_date + v_product.shelf_life_days end);
      perform public.pantry_put(v_household, v_product_id, v_zone, v_line.quantity, v_line.unit, v_expires, true);
      insert into public.pantry_events (household_id, product_id, label, delta, unit, reason, ref_id, price_mxn)
      values (v_household, v_product_id, v_line.label, v_line.quantity, v_line.unit, 'purchase',
              coalesce(v_line.grocery_item_id, p_proposal_id), v_line.price_mxn);
    end if;
    v_count := v_count + 1;
  end loop;

  update public.pantry_proposals set status = 'applied', decided_at = now() where id = p_proposal_id;
  return v_count;
end;
$$;

revoke execute on function public.set_pantry_quantity(uuid, numeric, text) from public, anon;
revoke execute on function public.apply_pantry_proposal(uuid, uuid[], jsonb) from public, anon;
grant execute on function
  public.is_unit_code(text),
  public.set_pantry_quantity(uuid, numeric, text),
  public.apply_pantry_proposal(uuid, uuid[], jsonb)
to authenticated;
