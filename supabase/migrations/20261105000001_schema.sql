-- Mesa — core schema (step 1 of the MVP, ready for step 2).
-- Every household-owned row carries household_id. No author attribution by design.

create type public.category as enum ('produce','bakery','meat','dairy','frozen','cupboard','drinks','household','other');
create type public.zone as enum ('fridge','freezer','cupboard');
create type public.unit_family as enum ('mass','volume','count','other');
create type public.grocery_status as enum ('to_buy','in_cart','bought','removed');
create type public.grocery_source as enum ('manual','recipe','usual','ran_out');
create type public.pantry_reason as enum ('purchase','cook','correction','have');
create type public.pantry_level as enum ('full','half','low','out');
create type public.import_status as enum ('queued','processing','done','failed');
create type public.import_platform as enum ('youtube','instagram','tiktok','web','image','text','manual','other');

-- Households and people -------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  default_servings int not null default 3 check (default_servings between 1 and 20),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now()
);
create index profiles_household on public.profiles (household_id);

create table public.invites (
  code text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- Resolves the household of the signed-in person. Used by RLS and column defaults.
create or replace function public.current_household_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- Product catalog -------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade, -- null = shared catalog
  name_en text not null,
  category public.category not null default 'other',
  default_zone public.zone not null default 'cupboard',
  shelf_life_days int check (shelf_life_days is null or shelf_life_days > 0),
  is_staple boolean not null default false,
  unit_family public.unit_family not null default 'count',
  created_at timestamptz not null default now()
);
create unique index products_global_name on public.products (lower(name_en)) where household_id is null;
create unique index products_household_name on public.products (household_id, lower(name_en)) where household_id is not null;

-- Aliases are stored normalized: lowercase, no accents, trimmed.
create table public.product_aliases (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  lang text not null default 'en'
);
create unique index product_aliases_unique on public.product_aliases (product_id, alias);
create index product_aliases_lookup on public.product_aliases (alias);

-- Recipes ---------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  servings int not null default 4 check (servings between 1 and 50),
  total_minutes int check (total_minutes is null or total_minutes > 0),
  source_url text,
  source_platform public.import_platform not null default 'manual',
  image_path text, -- path in the recipe-images bucket, or an absolute https URL
  original jsonb,  -- frozen copy of what the import extracted; never edited
  notes text,
  is_favorite boolean not null default false,
  last_cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_household on public.recipes (household_id, created_at desc);

-- unit codes: g, ml, unit, tbsp, tsp, cup, can, bunch, pack, clove, pinch, slice (or null)
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position int not null default 0,
  raw_text text not null,
  name text not null,
  product_id uuid references public.products(id) on delete set null,
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  is_guessed boolean not null default false,
  is_optional boolean not null default false
);
create index recipe_ingredients_recipe on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position int not null default 0,
  text text not null
);
create index recipe_steps_recipe on public.recipe_steps (recipe_id, position);

create table public.up_next (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  servings int not null check (servings between 1 and 50),
  planned_for date, -- unused in the MVP; the future calendar
  created_at timestamptz not null default now()
);
create index up_next_household on public.up_next (household_id, created_at);

-- Groceries -------------------------------------------------------------------

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  product_id uuid references public.products(id) on delete set null,
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  category public.category not null default 'other',
  status public.grocery_status not null default 'to_buy',
  source public.grocery_source not null default 'manual',
  checked_at timestamptz,
  bought_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grocery_items_active on public.grocery_items (household_id, status);

create table public.grocery_item_recipes (
  grocery_item_id uuid not null references public.grocery_items(id) on delete cascade,
  up_next_id uuid not null references public.up_next(id) on delete cascade,
  recipe_title text not null,
  quantity numeric,
  unit text,
  primary key (grocery_item_id, up_next_id)
);
create index grocery_item_recipes_up_next on public.grocery_item_recipes (up_next_id);

-- Pantry (filled from step 1, shown from step 2) -------------------------------

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  zone public.zone not null,
  quantity numeric,
  unit text,
  level public.pantry_level,
  expires_on date,
  updated_at timestamptz not null default now(),
  unique (household_id, product_id, zone)
);

create table public.pantry_events (
  id bigint generated always as identity primary key,
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  label text not null,
  delta numeric,
  unit text,
  reason public.pantry_reason not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index pantry_events_household on public.pantry_events (household_id, reason, created_at desc);

-- Imports ---------------------------------------------------------------------

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  input_url text,
  input_text text,
  input_image_path text,
  platform public.import_platform,
  status public.import_status not null default 'queued',
  error text,
  attempts int not null default 0,
  recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (input_url is not null or input_text is not null or input_image_path is not null)
);
create index import_jobs_queue on public.import_jobs (status, created_at);
create index import_jobs_household on public.import_jobs (household_id, created_at desc);

create table public.push_tokens (
  token text primary key,
  household_id uuid not null default public.current_household_id() references public.households(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- updated_at ------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();
create trigger grocery_items_touch before update on public.grocery_items
  for each row execute function public.touch_updated_at();
create trigger pantry_items_touch before update on public.pantry_items
  for each row execute function public.touch_updated_at();

-- A profile row for every new account ------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
