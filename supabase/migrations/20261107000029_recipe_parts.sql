-- Recipes saved without their parts get them (Nov 2026).
--   1. heading_of: the section a heading line names, the way packages/shared/src/sections.ts sectionHeading
--      reads it ("Sauce:", "[Sauce]", "{Sauce}", "**Sauce**", "__Sauce__", "## Sauce", "— Sauce —"); null
--      for an ingredient line. Keep both in step.
--   2. Heading lines saved as ingredients (typed in the editor before it knew headings, or as "[Marinade]",
--      which it didn't read yet) become what they mean: the lines under one take its section, and the
--      heading line goes.
--   3. Redo ingredients may give a recipe its parts: apply_reread writes the sections the worker found when
--      the recipe has none (the person's sections, once there are any, are never written).
--   4. Every recipe of 6 lines or more still without parts is read again once, by the server (no quota,
--      after people's jobs, no push): its lines get today's names and the parts its steps show
--      (apps/worker/src/section-guess.ts; a simple list stays one list).
-- Deploy: the worker that comes with it first (it finds the parts and sends them); then this migration,
-- which queues the rereads. The running worker on this database: its rereads send no parts (nothing changes).

-- 1. Heading lines -------------------------------------------------------------------------------------------

create or replace function public.heading_of(p_line text)
returns text
language plpgsql
immutable
as $$
declare
  t text := btrim(regexp_replace(coalesce(p_line, ''), '\s+', ' ', 'g'));
  v_name text;
begin
  if t ~ '[:：]$' then
    v_name := t;
  else
    v_name := coalesce(
      substring(t from '^\[([^]]+)\]$'),
      substring(t from '^\{([^}]+)\}$'),
      substring(t from '^\*\*([^*]+)\*\*$'),
      substring(t from '^__([^_]+)__$'),
      substring(t from '^#{1,6} ?([^#]+)$'),
      substring(t from '^[-–—=]+ ?([^-–—=]+) ?[-–—=]+$'));
    -- "[1 cup]" is no part.
    if v_name is null or v_name ~ '[0-9]' then
      return null;
    end if;
  end if;
  v_name := btrim(regexp_replace(regexp_replace(v_name, '^[ #*•·–—-]+', ''), '[ :：]+$', ''));
  if v_name !~ '[[:alpha:]]' then
    return null;
  end if;
  return btrim(left(v_name, 60));
end;
$$;

-- 2. Heading lines saved as ingredients become sections ------------------------------------------------------

-- Returns how many heading lines went. Runs once below (server only).
create or replace function public.repair_heading_lines()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_gone int;
begin
  with heads as (
    select i.id, i.recipe_id, i.position, public.heading_of(i.raw_text) as section
    from public.recipe_ingredients i
    where public.heading_of(i.raw_text) is not null
  ), placed as (
    select i.id,
           (select h.section from heads h
            where h.recipe_id = i.recipe_id and (h.position, h.id) < (i.position, i.id)
            order by h.position desc, h.id desc
            limit 1) as section
    from public.recipe_ingredients i
    where i.section is null
      and public.heading_of(i.raw_text) is null
      and exists (select 1 from heads h where h.recipe_id = i.recipe_id)
  )
  update public.recipe_ingredients i
    set section = p.section
    from placed p
    where i.id = p.id and p.section is not null;

  delete from public.recipe_ingredients where public.heading_of(raw_text) is not null;
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;
revoke execute on function public.repair_heading_lines() from public, anon, authenticated;

select public.repair_heading_lines();

-- 3. Redo ingredients may give a recipe its parts ------------------------------------------------------------

-- Writes the lines read again (p_rows: recipe_ingredients rows with their id) when the recipe is still as
-- the worker read it (p_read_at: its updated_at then). False, and nothing written, when anything changed.
-- A line's raw text is the person's; so are its section once the recipe has any: the sections in p_rows are
-- written only for a recipe that has none.
create or replace function public.apply_reread(p_recipe uuid, p_read_at timestamptz, p_rows jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_updated timestamptz;
  v_sectioned boolean;
begin
  select updated_at into v_updated from public.recipes where id = p_recipe for update;
  if not found or v_updated is distinct from p_read_at then
    return false;
  end if;
  v_sectioned := exists (select 1 from public.recipe_ingredients where recipe_id = p_recipe and section is not null);
  update public.recipe_ingredients i
    set position = x.position,
        name = x.name,
        product_id = x.product_id,
        quantity = x.quantity,
        unit = x.unit,
        is_guessed = coalesce(x.is_guessed, false),
        is_optional = coalesce(x.is_optional, false),
        section = case when v_sectioned then i.section else x.section end
    from jsonb_populate_recordset(null::public.recipe_ingredients, p_rows) x
    where i.id = x.id and i.recipe_id = p_recipe;
  return true;
end;
$$;
revoke execute on function public.apply_reread(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_reread(uuid, timestamptz, jsonb) to service_role;

-- 4. Every recipe without parts read again once ---------------------------------------------------------------

-- Returns how many were queued. Runs once below (server only).
create or replace function public.queue_part_rereads()
returns int
language sql
set search_path = public
as $$
  with queued as (
    insert into public.import_jobs (household_id, kind, subject_id, input_text, created_by)
    select r.household_id, 'reread', r.id, r.title, null
    from public.recipes r
    where (select count(*) from public.recipe_ingredients i where i.recipe_id = r.id) >= 6
      and not exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id and i.section is not null)
      and not exists (select 1 from public.import_jobs j
                      where j.kind = 'reread' and j.subject_id = r.id and j.status in ('queued', 'processing'))
    returning 1
  )
  select count(*)::int from queued
$$;
revoke execute on function public.queue_part_rereads() from public, anon, authenticated;

select public.queue_part_rereads();
