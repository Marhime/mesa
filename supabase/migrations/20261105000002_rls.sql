-- Row level security: a signed-in person only sees and changes their household's data.

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.up_next enable row level security;
alter table public.grocery_items enable row level security;
alter table public.grocery_item_recipes enable row level security;
alter table public.pantry_items enable row level security;
alter table public.pantry_events enable row level security;
alter table public.import_jobs enable row level security;
alter table public.push_tokens enable row level security;

-- households: read and rename your own
create policy households_select on public.households for select to authenticated
  using (id = public.current_household_id());
create policy households_update on public.households for update to authenticated
  using (id = public.current_household_id()) with check (id = public.current_household_id());

-- profiles: see yourself and your household; edit only your display name
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or household_id = public.current_household_id());
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- invites: only through functions (no policy = no direct access)

-- products: shared catalog for everyone, plus the household's own products
create policy products_select on public.products for select to authenticated
  using (household_id is null or household_id = public.current_household_id());
create policy products_insert on public.products for insert to authenticated
  with check (household_id = public.current_household_id());
create policy products_update on public.products for update to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy products_delete on public.products for delete to authenticated
  using (household_id = public.current_household_id());

create policy product_aliases_select on public.product_aliases for select to authenticated
  using (exists (select 1 from public.products p where p.id = product_id
                 and (p.household_id is null or p.household_id = public.current_household_id())));
create policy product_aliases_insert on public.product_aliases for insert to authenticated
  with check (exists (select 1 from public.products p where p.id = product_id
                      and p.household_id = public.current_household_id()));

-- household-owned tables: one policy each, for every command
create policy recipes_all on public.recipes for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy up_next_all on public.up_next for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy grocery_items_all on public.grocery_items for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy pantry_items_all on public.pantry_items for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy pantry_events_all on public.pantry_events for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy import_jobs_all on public.import_jobs for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());
create policy push_tokens_all on public.push_tokens for all to authenticated
  using (household_id = public.current_household_id()) with check (household_id = public.current_household_id());

-- children of a recipe / grocery item follow their parent
create policy recipe_ingredients_all on public.recipe_ingredients for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.current_household_id()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.current_household_id()));
create policy recipe_steps_all on public.recipe_steps for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.current_household_id()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.current_household_id()));
create policy grocery_item_recipes_all on public.grocery_item_recipes for all to authenticated
  using (exists (select 1 from public.grocery_items g where g.id = grocery_item_id and g.household_id = public.current_household_id()))
  with check (exists (select 1 from public.grocery_items g where g.id = grocery_item_id and g.household_id = public.current_household_id()));
