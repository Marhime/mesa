-- Amounts you can correct: on a pantry row, and in a scan's review before applying.
\set ON_ERROR_STOP on

reset role;
select id as household from public.households where name = 'Casa' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select id as milk_row from public.pantry_items
  where product_id = '10000000-0000-0000-0000-000000000003' and zone = 'fridge' \gset
select set_config('test.milk_row', :'milk_row', false);

-- "1.5 L left", typed on the tile
select public.set_pantry_quantity(:'milk_row', 1500, 'ml');
do $$ begin
  assert (select quantity from public.pantry_items where id = current_setting('test.milk_row')::uuid) = 1500, 'amount saved';
  assert (select unit from public.pantry_items where id = current_setting('test.milk_row')::uuid) = 'ml', 'unit saved';
  assert (select level from public.pantry_items where id = current_setting('test.milk_row')::uuid) = 'full', 'an amount is the truth';
  assert exists (select 1 from public.pantry_events where ref_id = current_setting('test.milk_row')::uuid and reason = 'correction'),
    'the correction is logged';
end $$;

-- Clearing the amount keeps the row; zero, negatives and unknown units are refused
select public.set_pantry_quantity(:'milk_row', null, null);
do $$ begin
  assert (select quantity from public.pantry_items where id = current_setting('test.milk_row')::uuid) is null, 'amount cleared';
  begin
    perform public.set_pantry_quantity(current_setting('test.milk_row')::uuid, 0, 'ml');
    assert false, 'zero accepted (it is "out")';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_pantry_quantity(current_setting('test.milk_row')::uuid, 2, 'bottles');
    assert false, 'unknown unit accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- A fridge scan sees 500 ml left: it replaces the 2 L, it does not add to them
select public.set_pantry_quantity(:'milk_row', 2000, 'ml');
reset role;
insert into public.pantry_proposals (id, household_id, kind, zone) values
  ('30000000-0000-0000-0000-000000000011', :'household', 'sweep', 'fridge'),
  ('30000000-0000-0000-0000-000000000012', :'household', 'sweep', 'fridge'),
  ('30000000-0000-0000-0000-000000000013', :'household', 'sweep', 'fridge');
insert into public.pantry_proposal_lines (id, proposal_id, action, product_id, label, category, zone, quantity, unit) values
  ('33000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 'update', '10000000-0000-0000-0000-000000000003', 'Test milk', 'dairy', 'fridge', 500, 'ml'),
  ('33000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000012', 'update', '10000000-0000-0000-0000-000000000003', 'Test milk', 'dairy', 'fridge', 500, 'ml'),
  ('33000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000013', 'update', '10000000-0000-0000-0000-000000000003', 'Test milk', 'dairy', 'fridge', 500, 'ml');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

select public.apply_pantry_proposal('30000000-0000-0000-0000-000000000011', array['33000000-0000-0000-0000-000000000001']::uuid[]);
do $$ begin
  assert (select quantity from public.pantry_items
          where product_id = '10000000-0000-0000-0000-000000000003' and zone = 'fridge') = 500, 'scan amount replaces';
end $$;

-- The person corrects the photo's amount in the review: 750 ml, not 500
select public.apply_pantry_proposal('30000000-0000-0000-0000-000000000012', array['33000000-0000-0000-0000-000000000002']::uuid[],
  '[{"id": "33000000-0000-0000-0000-000000000002", "quantity": 750, "unit": "ml"}]'::jsonb);
do $$ begin
  assert (select quantity from public.pantry_items
          where product_id = '10000000-0000-0000-0000-000000000003' and zone = 'fridge') = 750, 'corrected amount wins';
  begin
    perform public.apply_pantry_proposal('30000000-0000-0000-0000-000000000013', array['33000000-0000-0000-0000-000000000003']::uuid[],
      '[{"id": "33000000-0000-0000-0000-000000000003", "quantity": 1, "unit": "bottles"}]'::jsonb);
    assert false, 'unknown unit accepted in a review';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Corrected to 0: it is gone
select public.apply_pantry_proposal('30000000-0000-0000-0000-000000000013', array['33000000-0000-0000-0000-000000000003']::uuid[],
  '[{"id": "33000000-0000-0000-0000-000000000003", "quantity": 0, "unit": "ml"}]'::jsonb);
do $$ begin
  assert not public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000003'), 'milk corrected to 0 is out';
end $$;

reset role;
select 'AMOUNTS TESTS PASSED' as result;
