-- Creators: recipes remember who made them; a household follows creators; people ask for a creator's videos.
\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.recipes set source_author = 'Food is Love', source_channel_id = 'UCE-NIVMcV8A2GwGcCYLSMDQ',
  source_channel_url = 'https://www.youtube.com/channel/UCE-NIVMcV8A2GwGcCYLSMDQ'
where id = '20000000-0000-0000-0000-000000000001';
insert into public.followed_creators (channel_id, name, url)
values ('UCE-NIVMcV8A2GwGcCYLSMDQ', 'Food is Love', 'https://www.youtube.com/channel/UCE-NIVMcV8A2GwGcCYLSMDQ');
insert into public.import_jobs (kind, input_url) values ('creator', 'https://www.youtube.com/channel/UCE-NIVMcV8A2GwGcCYLSMDQ');
insert into public.import_jobs (kind, subject_id, input_text) values ('creator', '20000000-0000-0000-0000-000000000001', 'more');
do $$ begin
  begin
    insert into public.followed_creators (channel_id, name, url) values ('UCE-NIVMcV8A2GwGcCYLSMDQ', 'Again', 'https://www.youtube.com/channel/x');
    assert false, 'followed twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.followed_creators (channel_id, name, url) values ('x', 'Bad', 'javascript:alert(1)');
    assert false, 'a non-https creator link was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Karla sees the follow; a stranger doesn't
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.followed_creators) = 1, 'the household shares its creators';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.followed_creators) = 0, 'a stranger sees none';
end $$;

reset role;
select 'CREATORS TESTS PASSED' as result;
