-- Invites that can't be guessed, photos that stay private, and a ceiling on AI spend (Nov 2026).
--   1. Invite codes: 10 characters from 32 (50 bits, from gen_random_uuid's strong randomness, where
--      random() was 6 characters), one code per kitchen at a time (a new one replaces the last), and at
--      most 10 wrong codes an hour per person. A wrong code returns null instead of raising, so the try
--      stays counted; the app says the code didn't work. The old 6-character codes stop working.
--   2. What people show Mesa stays private. The app uploads screenshots and shared photos to the private
--      'scans' bucket (with receipts and fridge videos) instead of the public recipe-images one; only a
--      dish photo the worker keeps becomes a public recipe picture. shared_media_to_delete lists what the
--      worker removes: in 'scans', what a finished job used and anything a day old (time enough to try
--      again); in 'recipe-images', every file a day old that is no recipe's picture (the screenshots and
--      receipts shared before this migration). Both buckets refuse what isn't a picture (or a fridge
--      video) and anything too large; the app no longer writes to recipe-images.
--   3. A daily ceiling on AI spend: ai_usage adds up the worker's model calls and tokens per UTC day
--      (record_ai_usage); past the ceiling the worker answers "try again tomorrow" (apps/worker/src/ai-budget.ts).
-- Storage parts are skipped where there is no storage schema (the SQL test harness).

-- 1. Invites -------------------------------------------------------------------------------------------------

create or replace function public.invite_code()
returns text
language sql
volatile
as $$
  -- Byte 6 holds the uuid's version and byte 8 its variant: skipped. 32 divides 256: every letter as likely.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(u.b, t.i) % 32, 1), '' order by t.n)
  from (select uuid_send(gen_random_uuid()) as b) u,
       unnest(array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11]) with ordinality as t(i, n)
$$;
revoke execute on function public.invite_code() from public, anon, authenticated;

create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
  v_code text;
begin
  if v_household is null then
    raise exception 'no household' using errcode = 'P0001';
  end if;
  -- One code at a time.
  delete from public.invites where household_id = v_household;
  loop
    v_code := public.invite_code();
    begin
      insert into public.invites (code, household_id) values (v_code, v_household);
      return v_code;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
end;
$$;
revoke execute on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

delete from public.invites where length(code) < 10;

create table if not exists public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists join_attempts_user on public.join_attempts (user_id, at desc);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;
grant all on public.join_attempts to service_role;

-- The kitchen the code opens, or null when it opens none (wrong or expired). Spaces, dashes and case
-- don't matter ("abcde-fghjk").
create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.join_attempts where user_id = auth.uid() and at < now() - interval '1 day';
  if (select count(*) from public.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many tries. Wait an hour, or ask for a new code.' using errcode = 'P0001';
  end if;
  delete from public.invites
  where code = v_code and expires_at > now()
  returning household_id into v_household;
  if v_household is null then
    insert into public.join_attempts (user_id) values (auth.uid());
    return null;
  end if;
  insert into public.profiles (id, household_id) values (auth.uid(), v_household)
  on conflict (id) do update set household_id = excluded.household_id;
  return v_household;
end;
$$;
revoke execute on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

-- 2. Private media ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    update storage.buckets
      set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'recipe-images';
    update storage.buckets
      set file_size_limit = 52428800,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
      where id = 'scans';

    -- Recipe pictures are the worker's to write; the app may still remove its kitchen's.
    drop policy if exists recipe_images_insert on storage.objects;
    drop policy if exists recipe_images_update on storage.objects;

    execute $f$
      create or replace function public.shared_media_to_delete(p_limit int default 200)
      returns table (bucket text, path text)
      language sql
      stable
      security definer
      set search_path = public, storage
      as $q$
        with live as (
          select j.input_image_path as path from public.import_jobs j
          where j.status in ('queued', 'processing') and j.input_image_path is not null
          union
          select unnest(j.input_image_paths) from public.import_jobs j
          where j.status in ('queued', 'processing') and j.input_image_paths is not null
        ), used as (
          select j.input_image_path as path from public.import_jobs j
          where j.status = 'done' and j.input_image_path is not null
          union
          select unnest(j.input_image_paths) from public.import_jobs j
          where j.status = 'done' and j.input_image_paths is not null
        ), pictures as (
          select ltrim(r.image_path, '/') as path from public.recipes r where r.image_path is not null
        )
        (select o.bucket_id::text, o.name
         from storage.objects o
         where o.bucket_id = 'scans'
           and o.name not in (select path from live)
           and (o.created_at < now() - interval '1 day' or o.name in (select path from used)))
        union all
        (select o.bucket_id::text, o.name
         from storage.objects o
         where o.bucket_id = 'recipe-images'
           and o.created_at < now() - interval '1 day'
           and o.name not in (select path from live)
           and o.name not in (select path from pictures where path is not null))
        limit greatest(p_limit, 0)
      $q$
    $f$;
    execute 'revoke execute on function public.shared_media_to_delete(int) from public, anon, authenticated';
    execute 'grant execute on function public.shared_media_to_delete(int) to service_role';
  end if;
end
$$;

-- 3. AI spend ---------------------------------------------------------------------------------------------------

create table if not exists public.ai_usage (
  -- UTC day.
  day date primary key,
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;

-- Adds a call's use to today's and returns the day so far.
create or replace function public.record_ai_usage(p_calls int, p_input_tokens bigint, p_output_tokens bigint)
returns public.ai_usage
language sql
set search_path = public
as $$
  insert into public.ai_usage as u (day, calls, input_tokens, output_tokens)
  values ((now() at time zone 'utc')::date, greatest(p_calls, 0), greatest(p_input_tokens, 0), greatest(p_output_tokens, 0))
  on conflict (day) do update
    set calls = u.calls + excluded.calls,
        input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens
  returning u.*
$$;
revoke execute on function public.record_ai_usage(int, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(int, bigint, bigint) to service_role;
