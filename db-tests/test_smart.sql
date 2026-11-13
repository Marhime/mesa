-- The smart kitchen: background kinds in one place, suggestions read and decided by the household.
\set ON_ERROR_STOP on

reset role;
select id as household from public.households where name = 'Casa' \gset
do $$ begin
  assert public.is_background_kind('for_you') and public.is_background_kind('tidy') and not public.is_background_kind('ask'), 'background kinds';
end $$;
select public.queue_for_you() as queued \gset
do $$ begin
  assert (select count(*) from public.import_jobs where kind = 'for_you' and status = 'queued') >= 1, 'weekly look queued';
  assert public.queue_for_you() = 0, 'not twice while one waits';
end $$;
insert into public.suggestions (household_id, url, title, creator, why)
values (:'household', 'https://www.youtube.com/watch?v=xyz', 'Cochinita pibil', 'Cooking Con Claudia', 'Like the tinga you made twice');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.import_jobs (kind, input_text) values ('find', 'spicy chicken, 30 min');
insert into public.import_jobs (kind, input_text) values ('plan', 'week');
insert into public.import_jobs (kind, input_text, input_context) values ('ask', 'what can I cook in 20 min?', '[{"q":"hi","a":"hello"}]');
do $$ begin
  -- Adapting is a question to Ask Mesa now: the kind is gone.
  begin
    insert into public.import_jobs (kind, subject_id, input_text) values ('adapt', '20000000-0000-0000-0000-000000000001', 'no cream');
    assert false, 'the app queued an adapt job';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.import_jobs (kind, input_text) values ('for_you', 'weekly');
    assert false, 'the app queued the weekly look';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.suggestions where status = 'new') = 1, 'the household sees its suggestions';
  begin
    update public.suggestions set why = 'changed';
    assert false, 'the app rewrote a suggestion';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.suggestions set status = 'dismissed' where url = 'https://www.youtube.com/watch?v=xyz';
do $$ begin
  assert (select status from public.suggestions limit 1) = 'dismissed', 'Not for us';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.suggestions) = 0, 'a stranger sees none';
end $$;

reset role;
select 'SMART KITCHEN TESTS PASSED' as result;
