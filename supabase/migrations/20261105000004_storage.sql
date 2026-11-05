-- Recipe images bucket. Paths are "<household_id>/<uuid>.<ext>".
-- Public read keeps image loading simple; paths are unguessable.
-- Guarded so the SQL test harness (plain Postgres, no storage schema) can skip it.

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('recipe-images', 'recipe-images', true)
    on conflict (id) do nothing;

    execute $p$
      create policy recipe_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'recipe-images'
                  and (storage.foldername(name))[1] = public.current_household_id()::text)
    $p$;
    execute $p$
      create policy recipe_images_update on storage.objects for update to authenticated
      using (bucket_id = 'recipe-images'
             and (storage.foldername(name))[1] = public.current_household_id()::text)
    $p$;
    execute $p$
      create policy recipe_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'recipe-images'
             and (storage.foldername(name))[1] = public.current_household_id()::text)
    $p$;
  end if;
end
$$;
