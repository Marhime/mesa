-- Mesa — Kitchen Sweep and Ticket In (expert panel, lots 2–3).
-- A video of the fridge, or a photo of a receipt, becomes an import job of another kind. The worker
-- reads it with Gemini and writes a *proposal*: changes to the pantry (and, for a receipt, to the list)
-- that the household reviews in the app before anything is applied.

alter table public.import_jobs
  add column kind text not null default 'recipe' check (kind in ('recipe', 'sweep', 'receipt')),
  add column zone public.zone,
  add column proposal_id uuid;

-- What a receipt says things cost (MXN), kept with the purchase.
alter table public.pantry_events add column price_mxn numeric check (price_mxn is null or price_mxn >= 0);

create table public.pantry_proposals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  job_id uuid references public.import_jobs(id) on delete set null,
  kind text not null check (kind in ('sweep', 'receipt')),
  zone public.zone,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  -- receipt: {store, date, total_mxn, missed: [{id, label}]}; sweep: {confirmed: n}
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index pantry_proposals_household on public.pantry_proposals (household_id, status, created_at desc);

alter table public.import_jobs
  add constraint import_jobs_proposal_fk foreign key (proposal_id) references public.pantry_proposals(id) on delete set null;

-- add: seen, not in the pantry · update: in the pantry, less left · out: not seen (probably gone) ·
-- bought: on the receipt (grocery_item_id when it was on the list).
create table public.pantry_proposal_lines (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.pantry_proposals(id) on delete cascade,
  position int not null default 0,
  action text not null check (action in ('add', 'update', 'out', 'bought')),
  product_id uuid references public.products(id) on delete set null,
  label text not null,
  category public.category not null default 'other',
  zone public.zone,
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  level public.pantry_level,
  expires_on date,
  price_mxn numeric check (price_mxn is null or price_mxn >= 0),
  grocery_item_id uuid references public.grocery_items(id) on delete set null,
  confidence numeric not null default 1 check (confidence between 0 and 1),
  -- Pre-ticked in the review sheet (sure enough to apply as is).
  suggested boolean not null default true
);
create index pantry_proposal_lines_proposal on public.pantry_proposal_lines (proposal_id, position);

alter table public.pantry_proposals enable row level security;
alter table public.pantry_proposal_lines enable row level security;
create policy pantry_proposals_all on public.pantry_proposals for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
create policy pantry_proposal_lines_all on public.pantry_proposal_lines for all to authenticated
  using (exists (select 1 from public.pantry_proposals p where p.id = proposal_id and p.household_id = public.current_household_id()))
  with check (exists (select 1 from public.pantry_proposals p where p.id = proposal_id and p.household_id = public.current_household_id()));

-- Applies the ticked lines of a proposal (once). Returns how many lines changed something.
create or replace function public.apply_pantry_proposal(p_proposal_id uuid, p_line_ids uuid[])
returns int
language plpgsql
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_proposal public.pantry_proposals;
  v_line public.pantry_proposal_lines;
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
    v_product_id := coalesce(v_line.product_id, public.ensure_product(v_line.label, v_line.category));
    select * into v_product from public.products where id = v_product_id;
    v_zone := coalesce(v_line.zone, v_proposal.zone, v_product.default_zone);

    if v_line.action = 'out' then
      perform public.pantry_out(v_product_id, false);
    elsif v_line.action in ('add', 'update') then
      perform public.pantry_put(v_household, v_product_id, v_zone, v_line.quantity, v_line.unit, v_line.expires_on, false);
      if v_line.level is not null and v_line.level <> 'full' then
        update public.pantry_items set level = v_line.level, quantity = v_line.quantity
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

create or replace function public.dismiss_pantry_proposal(p_proposal_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.pantry_proposals set status = 'dismissed', decided_at = now()
  where id = p_proposal_id and status = 'pending'
$$;

grant execute on function
  public.apply_pantry_proposal(uuid, uuid[]),
  public.dismiss_pantry_proposal(uuid)
to authenticated;

-- Live: the other phone hears about new proposals.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantry_proposals') then
    alter publication supabase_realtime add table public.pantry_proposals;
  end if;
end
$$;

-- Private bucket for fridge videos and receipts: "<household_id>/<uuid>.<ext>", household-only.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('scans', 'scans', false, 52428800)
    on conflict (id) do nothing;

    execute $p$
      create policy scans_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'scans' and (storage.foldername(name))[1] = public.current_household_id()::text)
    $p$;
    execute $p$
      create policy scans_select on storage.objects for select to authenticated
      using (bucket_id = 'scans' and (storage.foldername(name))[1] = public.current_household_id()::text)
    $p$;
    execute $p$
      create policy scans_delete on storage.objects for delete to authenticated
      using (bucket_id = 'scans' and (storage.foldername(name))[1] = public.current_household_id()::text)
    $p$;
  end if;
end
$$;
