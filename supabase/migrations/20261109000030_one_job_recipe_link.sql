-- The app could not start an import any more (Nov 2026). Migration 27 joined import_jobs and recipes a second
-- time (recipes.import_job_id, next to import_jobs.recipe_id): the API could no longer tell which link the
-- app's "recipe:recipes(…)" meant (PostgREST PGRST201, "more than one relationship"), and refused every read
-- of the imports and every new one.
-- recipes.import_job_id stays a key without a foreign key: save_imported_recipe looks a recipe up by it, and
-- its unique index keeps one recipe per import. Nothing follows it to the job; a deleted job leaves an id no
-- job will have again.
-- Each embed the app and the worker ask the API for has one link to follow: db-tests/test_api_links.sql.
-- Deploy: this migration alone, at once (no worker, no app update).

alter table public.recipes drop constraint if exists recipes_import_job_fk;

comment on column public.recipes.import_job_id is
  'The import that wrote this recipe (save_imported_recipe). No foreign key: import_jobs.recipe_id is the one link the API follows between the two.';

-- The API reads its links again now, not at its next look.
notify pgrst, 'reload schema';
