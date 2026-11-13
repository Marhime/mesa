-- Honest import feedback (panel 2, lot A): who shared, stages, codes, per-person push tokens.
\set ON_ERROR_STOP on

-- Karla shares a reel: the job is hers
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into public.import_jobs (id, input_url) values ('40000000-0000-0000-0000-000000000001', 'https://www.instagram.com/reel/ABC/');
do $$ begin
  assert (select created_by from public.import_jobs where id = '40000000-0000-0000-0000-000000000001')
    = '00000000-0000-0000-0000-00000000000b', 'the job remembers who shared';
  assert (select stage from public.import_jobs where id = '40000000-0000-0000-0000-000000000001') is null, 'no stage while queued';
end $$;

-- Her phone's token is hers; it follows whoever signs in on the device
select public.register_push_token('ExponentPushToken[karla]');
do $$ begin
  assert (select user_id from public.push_tokens where token = 'ExponentPushToken[karla]')
    = '00000000-0000-0000-0000-00000000000b', 'token belongs to Karla';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.register_push_token('ExponentPushToken[karla]');
do $$ begin
  assert (select user_id from public.push_tokens where token = 'ExponentPushToken[karla]')
    = '00000000-0000-0000-0000-00000000000a', 'signing in as Marhime on that phone moves the token';
end $$;

-- The worker claims it: the stage clock starts
reset role;
update public.import_jobs set status = 'done' where status in ('queued', 'processing') and id <> '40000000-0000-0000-0000-000000000001';
select id as claimed from public.claim_import_job() \gset
do $$ begin
  assert (select stage from public.import_jobs where id = '40000000-0000-0000-0000-000000000001') = 'opening', 'claimed jobs start opening';
  assert (select stage_at from public.import_jobs where id = '40000000-0000-0000-0000-000000000001') is not null, 'stage time set';
end $$;

-- A job a crashed worker left behind three times fails with a readable message and a code
update public.import_jobs set started_at = now() - interval '11 minutes', attempts = 3
  where id = '40000000-0000-0000-0000-000000000001';
select count(*) as none from public.claim_import_job() \gset
do $$ begin
  assert (select status from public.import_jobs where id = '40000000-0000-0000-0000-000000000001') = 'failed', 'gave up';
  assert (select error_code from public.import_jobs where id = '40000000-0000-0000-0000-000000000001') = 'timeout', 'timeout code';
  assert (select error from public.import_jobs where id = '40000000-0000-0000-0000-000000000001') like 'This took too long%', 'readable';
end $$;

-- Stages outside the list are refused
do $$ begin
  begin
    update public.import_jobs set stage = 'dancing' where id = '40000000-0000-0000-0000-000000000001';
    assert false, 'unknown stage accepted';
  exception when check_violation then null;
  end;
end $$;

select 'IMPORT FEEDBACK TESTS PASSED' as result;
