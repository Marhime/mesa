-- New from your creators: the daily look is the server's; the app reads and marks videos seen.
\set ON_ERROR_STOP on

reset role;
select id as household from public.households where name = 'Casa' \gset
select public.queue_follow_checks() as queued \gset
do $$ begin
  assert (select count(*) from public.import_jobs where kind = 'follow_check' and status = 'queued') = 1, 'one look for the household that follows';
  assert public.queue_follow_checks() = 0, 'not twice while one waits';
end $$;
insert into public.creator_videos (household_id, channel_id, url, title, is_new)
values (:'household', 'UCE-NIVMcV8A2GwGcCYLSMDQ', 'https://www.youtube.com/watch?v=abc', 'Hungarian paprika chicken', true);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.creator_videos where is_new) = 1, 'the household sees what is new';
  begin
    insert into public.import_jobs (kind, input_text) values ('follow_check', 'x');
    assert false, 'the app queued a follow check';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.creator_videos set title = 'renamed';
    assert false, 'the app renamed a video';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.creator_videos set is_new = false where channel_id = 'UCE-NIVMcV8A2GwGcCYLSMDQ';
do $$ begin
  assert (select count(*) from public.creator_videos where is_new) = 0, 'opened: nothing new';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.creator_videos) = 0, 'a stranger sees none';
end $$;

-- A follow check waits in the queue as long as it must, and doesn't count toward the import cap
reset role;
update public.import_jobs set queued_at = now() - interval '2 hours' where kind = 'follow_check';
select public.expire_stale_jobs() as expired \gset
do $$ begin
  assert (select status from public.import_jobs where kind = 'follow_check' limit 1) = 'queued', 'never expires';
end $$;

select 'CREATOR NEWS TESTS PASSED' as result;
