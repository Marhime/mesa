-- Live sync between the household's phones: these tables publish their changes over Supabase Realtime.
-- Realtime applies RLS, and the app filters on household_id, so a phone only hears about its household.
-- Guarded so the SQL test harness (plain Postgres, no supabase_realtime publication) can skip it.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['grocery_items', 'recipes', 'up_next', 'pantry_items', 'household_staples', 'import_jobs'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;
