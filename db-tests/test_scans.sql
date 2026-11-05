-- Kitchen Sweep and Ticket In (lots 2–3): proposals written by the worker, applied from the app.
\set ON_ERROR_STOP on

-- The worker (service role) writes a fridge sweep for Marhime's household
reset role;
select id as household from public.households where name = 'Casa' \gset
insert into public.pantry_proposals (id, household_id, kind, zone, summary) values
  ('30000000-0000-0000-0000-000000000001', :'household', 'sweep', 'fridge', '{"confirmed": 2}');
insert into public.pantry_proposal_lines (id, proposal_id, position, action, product_id, label, category, zone, quantity, unit, level, confidence, suggested) values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0, 'add', null, 'Epazote', 'produce', 'fridge', null, null, 'full', 0.9, true),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1, 'update', '10000000-0000-0000-0000-000000000003', 'Test milk', 'dairy', 'fridge', null, null, 'low', 0.8, true),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 2, 'out', '10000000-0000-0000-0000-000000000005', 'Test crema', 'dairy', 'fridge', null, null, null, 0.4, false);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.pantry_proposal_lines where proposal_id = '30000000-0000-0000-0000-000000000001') = 3,
    'the household sees its proposal';
end $$;

-- Applying only what was ticked: the unsure "out" line is left alone
select public.apply_pantry_proposal('30000000-0000-0000-0000-000000000001',
  array['31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002']::uuid[]) as applied \gset
do $$ begin
  assert (select status from public.pantry_proposals where id = '30000000-0000-0000-0000-000000000001') = 'applied', 'applied';
  assert exists (select 1 from public.pantry_status where name_en = 'Epazote' and zone = 'fridge'), 'epazote is in the fridge';
  assert (select level from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000003' and zone = 'fridge') = 'low',
    'milk is now low';
  assert public.pantry_has(public.current_household_id(), '10000000-0000-0000-0000-000000000005'), 'crema untouched (not ticked)';
  assert public.apply_pantry_proposal('30000000-0000-0000-0000-000000000001',
    array['31000000-0000-0000-0000-000000000003']::uuid[]) = 0, 'a proposal applies once';
end $$;

-- A receipt: the cilantro on the list, plus milk bought off the list, with prices
select id as cilantro_item from public.grocery_items where label = 'Cilantro' and status = 'to_buy' \gset
reset role;
insert into public.pantry_proposals (id, household_id, kind, summary) values
  ('30000000-0000-0000-0000-000000000002', :'household', 'receipt', '{"store": "Soriana", "total_mxn": 70}');
insert into public.pantry_proposal_lines (id, proposal_id, position, action, product_id, label, category, quantity, unit, price_mxn, grocery_item_id) values
  ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 'bought', null, 'Cilantro', 'produce', 1, 'bunch', 18, :'cilantro_item'),
  ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 1, 'bought', '10000000-0000-0000-0000-000000000003', 'Test milk', 'dairy', 2000, 'ml', 52, null);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('test.cilantro', :'cilantro_item', false);
select public.apply_pantry_proposal('30000000-0000-0000-0000-000000000002',
  array['32000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002']::uuid[]) as applied2 \gset
do $$ begin
  assert (select status from public.grocery_items where id = current_setting('test.cilantro')::uuid) = 'bought', 'cilantro checked off by the receipt';
  assert exists (select 1 from public.pantry_status where name_en = 'Cilantro'), 'cilantro put away';
  assert (select level from public.pantry_items where product_id = '10000000-0000-0000-0000-000000000003' and zone = 'fridge') = 'full',
    'fresh milk is full again';
  assert (select sum(price_mxn) from public.pantry_events where ref_id in (current_setting('test.cilantro')::uuid, '30000000-0000-0000-0000-000000000002')) = 70,
    'prices kept with the purchases';
end $$;

-- Dismissing; and a stranger sees no proposal
reset role;
insert into public.pantry_proposals (id, household_id, kind) values ('30000000-0000-0000-0000-000000000003', :'household', 'sweep');
set role authenticated;
select public.dismiss_pantry_proposal('30000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select status from public.pantry_proposals where id = '30000000-0000-0000-0000-000000000003') = 'dismissed', 'dismissed';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.pantry_proposals) = 0, 'stranger sees no proposals';
  assert (select count(*) from public.pantry_proposal_lines) = 0, 'nor their lines';
end $$;

reset role;
select 'SCANS TESTS PASSED' as result;
