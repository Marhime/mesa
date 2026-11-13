-- Every embed the app and the worker ask the API for ("table(columns)" inside a select) has exactly one
-- foreign key to follow: with two, PostgREST refuses the whole read (PGRST201), and with it the insert that
-- reads its row back (migration 30). An embed added in code is added here.
\set ON_ERROR_STOP on

reset role;

do $$
declare
  v_embed record;
  v_links int;
begin
  for v_embed in
    select * from (values
      ('import_jobs', 'recipes', 'apps/mobile/src/data/imports.ts'),
      ('up_next', 'recipes', 'apps/mobile/src/data/upNext.ts'),
      ('grocery_items', 'grocery_item_recipes', 'apps/mobile/src/data/groceryCache.ts'),
      ('recipes', 'recipe_ingredients', 'apps/mobile/src/data/recipes.ts, apps/worker/src/kitchen-context.ts'),
      ('recipes', 'recipe_steps', 'apps/mobile/src/data/recipes.ts, apps/worker/src/kitchen-context.ts')
    ) as e(base, embedded, used_in)
  loop
    select count(*) into v_links
    from pg_constraint c
    where c.contype = 'f'
      and ((c.conrelid = format('public.%I', v_embed.base)::regclass and c.confrelid = format('public.%I', v_embed.embedded)::regclass)
        or (c.conrelid = format('public.%I', v_embed.embedded)::regclass and c.confrelid = format('public.%I', v_embed.base)::regclass));
    assert v_links = 1,
      format('%s embeds %s (%s): %s foreign keys join them, the API needs exactly one',
             v_embed.base, v_embed.embedded, v_embed.used_in, v_links);
  end loop;
end $$;

-- What import_job_id still does without its foreign key: one recipe per import.
do $$ begin
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'recipes_import_job'),
    'one recipe per import';
end $$;
