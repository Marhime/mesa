-- Every recipe read again once (Nov 2026): recipes imported before the naming fixes may be linked under the
-- old rules (dark soy sauce shown as a second "Soy sauce"). The worker now keeps each line's own words and
-- tells dark soy sauce from soy sauce; one 'reread' per recipe brings every recipe up to date.
-- Like migration 22, never past the day's quota: each household keeps `p_keep` jobs for the people (to import
-- and ask today); recipes left over can be read again from the recipe's ⋯ menu.

create or replace function public.queue_all_rereads(p_keep int default 15)
returns int
language sql
set search_path = public
as $$
  with used as (
    select household_id, count(*)::int as n
    from public.import_jobs
    where not public.is_background_kind(kind) and created_at > now() - interval '1 day'
    group by household_id
  ), wanted as (
    select r.id, r.household_id, r.title,
           row_number() over (partition by r.household_id order by r.updated_at desc, r.id) as rank
    from public.recipes r
    where exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id)
      -- Not one read again in the last hour (migration 22 just did some), nor one waiting.
      and not exists (select 1 from public.import_jobs j
                      where j.kind = 'reread' and j.subject_id = r.id
                        and (j.status in ('queued', 'processing') or j.created_at > now() - interval '1 hour'))
  ), queued as (
    insert into public.import_jobs (household_id, kind, subject_id, input_text, created_by)
    select w.household_id, 'reread', w.id, w.title, null
    from wanted w
    left join used u on u.household_id = w.household_id
    where w.rank <= 60 - greatest(p_keep, 0) - coalesce(u.n, 0)
    returning 1
  )
  select count(*)::int from queued
$$;
revoke execute on function public.queue_all_rereads(int) from public, anon, authenticated;
grant execute on function public.queue_all_rereads(int) to service_role;

select public.queue_all_rereads();
