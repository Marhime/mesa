-- Invite codes that can't be guessed, and the worker's daily AI spend (migration 28).
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claim.sub', '', false);
select id as casa from public.households where name = 'Casa' \gset
select set_config('test.casa', :'casa', false);
insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-00000000000d', 'd@example.com'),
  ('e1000000-0000-0000-0000-00000000000e', 'e@example.com');

-- 1. Invites ---------------------------------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.create_invite() as first_code \gset
select public.create_invite() as code \gset
select set_config('test.first_code', :'first_code', false);
select set_config('test.code', :'code', false);
reset role;
do $$ begin
  assert current_setting('test.code') ~ '^[A-HJ-NP-Z2-9]{10}$', '10 characters, nothing easy to misread: ' || current_setting('test.code');
  assert (select count(*) from public.invites where household_id = current_setting('test.casa')::uuid) = 1, 'one code per kitchen';
  assert not exists (select 1 from public.invites where code = current_setting('test.first_code')), 'the new code replaced the first';
  assert (select count(distinct public.invite_code()) from generate_series(1, 200)) = 200, 'codes don''t repeat';
end $$;

set role authenticated;
-- Wrong codes open nothing, and the tries are counted: the 11th in an hour is refused.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000e', false);
do $$ begin
  for i in 1..10 loop
    assert public.join_household('WRONGCODE' || i) is null, 'a wrong code opened a kitchen';
  end loop;
  begin
    perform public.join_household(current_setting('test.code'));
    assert false, 'an 11th try in an hour was allowed';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.invite_code();
    assert false, 'the app made codes itself';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The right code, typed the way people type it.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert public.join_household(lower(substr(current_setting('test.code'), 1, 5)) || ' - ' || lower(substr(current_setting('test.code'), 6)))
       = current_setting('test.casa')::uuid, 'lowercase, with a dash and spaces';
  assert public.current_household_id() = current_setting('test.casa')::uuid, 'in the kitchen';
  assert public.join_household(current_setting('test.code')) is null, 'a code works once';
end $$;

-- People never see the tries.
do $$ begin
  begin
    perform 1 from public.join_attempts limit 1;
    assert false, 'the app read join attempts';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 2. AI spend --------------------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
select public.record_ai_usage(1, 1000, 200);
-- (select * from …: (f()).* would call it once per column)
select * from public.record_ai_usage(1, 500, -5) \gset u_
reset role;
select set_config('test.calls', :'u_calls', false);
select set_config('test.input', :'u_input_tokens', false);
select set_config('test.output', :'u_output_tokens', false);
do $$ begin
  assert current_setting('test.calls') = '2' and current_setting('test.input') = '1500' and current_setting('test.output') = '200',
    'the day so far, a negative count ignored';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    perform public.record_ai_usage(1, 1, 1);
    assert false, 'the app wrote AI usage';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ai_usage limit 1;
    assert false, 'the app read AI usage';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
select 'INVITES AND SPEND TESTS PASSED' as result;
