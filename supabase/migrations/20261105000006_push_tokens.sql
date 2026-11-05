-- A device's push token always belongs to the household of whoever is signed in
-- on it now, even if an earlier sign-out (offline) left it attached elsewhere.
create or replace function public.register_push_token(p_token text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_household uuid := public.current_household_id();
begin
  if v_household is null or p_token is null or length(trim(p_token)) = 0 then
    return;
  end if;
  insert into public.push_tokens (token, household_id)
  values (trim(p_token), v_household)
  on conflict (token) do update set household_id = excluded.household_id, created_at = now();
end;
$$;

revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
