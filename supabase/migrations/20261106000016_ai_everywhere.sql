-- AI where the app had dead ends (expert panel 4, Nov 2026), plus crash reports:
--   1. One recipe from several screenshots: import_jobs.input_image_paths (all of them, own household only).
--   2. "Ideas for the tomatoes" (kind 'idea') and translated steps (kind 'translate'): jobs people ask for,
--      answered in import_jobs.result / recipe_translations.
--   3. client_errors: what crashed on a phone, for the household to fix (insert only, read by the owner).
--   4. Tidy what households created before tidying existed.

-- 1. Several screenshots ------------------------------------------------------------------------------

create or replace function public.paths_in_household(p_paths text[], p_household uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(p like p_household::text || '/%'), true) from unnest(p_paths) as p
$$;

alter table public.import_jobs add column if not exists input_image_paths text[];
alter table public.import_jobs add constraint import_jobs_image_paths check (
  input_image_paths is null
  or (cardinality(input_image_paths) between 1 and 6 and public.paths_in_household(input_image_paths, household_id))
);

-- 2. Ideas and translations ---------------------------------------------------------------------------

alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check
  check (kind in ('recipe', 'sweep', 'receipt', 'tidy', 'idea', 'translate'));
-- An idea job's answer (UseItUpIdeas in packages/shared/src/types.ts).
alter table public.import_jobs add column if not exists result jsonb;

create table if not exists public.recipe_translations (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}$'),
  title text not null,
  steps jsonb not null,
  created_at timestamptz not null default now(),
  primary key (recipe_id, lang)
);
alter table public.recipe_translations enable row level security;
create policy recipe_translations_read on public.recipe_translations for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.current_household_id()));
-- Written by the worker only.
revoke insert, update, delete on public.recipe_translations from authenticated, anon;
grant select on public.recipe_translations to authenticated;

-- 3. Crash reports ------------------------------------------------------------------------------------

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  household_id uuid default public.current_household_id(),
  user_id uuid not null default auth.uid(),
  message text not null check (length(message) <= 2000),
  stack text check (stack is null or length(stack) <= 8000),
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists client_errors_recent on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
create policy client_errors_add on public.client_errors for insert to authenticated
  with check (user_id = auth.uid());
revoke select, update, delete on public.client_errors from authenticated, anon;
grant insert on public.client_errors to authenticated;

-- A crash loop sends at most 30 reports an hour per person; the rest are dropped quietly.
create or replace function public.client_errors_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.client_errors where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists client_errors_cap on public.client_errors;
create trigger client_errors_cap before insert on public.client_errors
  for each row execute function public.client_errors_cap();

-- 4. Tidy what was created before -------------------------------------------------------------------

insert into public.import_jobs (household_id, kind, input_text)
select distinct household_id, 'tidy', 'catch up'
from public.products
where household_id is not null and (family is null or picto is null);
