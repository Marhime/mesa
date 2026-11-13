-- Redo ingredients (Nov 2026): Mesa reads a saved recipe's ingredient lines again, one by one, with today's
-- naming and matching rules (kind 'reread'): each line's name, product, amount and optional flag. The recipe
-- keeps its title, steps, favorite and history; every line is kept, its text as written.
--   An asked kind: the app inserts it with subject_id = the recipe, input_text = its title (a label). The
--     worker rewrites the lines in place and answers in import_jobs.result: {"lines": n, "linked": n}.
--   A quick kind: the person waits on the recipe screen, so the quick lane takes it (is_quick_kind). It
--     counts toward the 60 jobs a day like every asked kind; it is not a background kind.
--   One-time: queue_rereads() gives a reread to every recipe with a line that points to no product (what
--     repair_vague_products() left unlinked in migration 21, or what was never matched), within each
--     household's 60 jobs a day. Those jobs have no created_by: nobody waits for them, nobody gets a push.
--   The worker that knows 'reread' must be running before this migration (docs/CONTRACT.md): an older one
--   would read the title as a pasted recipe.

alter table public.import_jobs drop constraint if exists import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check check (kind in (
  'recipe', 'sweep', 'receipt', 'tidy', 'idea', 'translate', 'creator', 'follow_check',
  'for_you', 'find', 'plan', 'adapt', 'ask', 'reread'
));

create or replace function public.is_quick_kind(p_kind text)
returns boolean
language sql
immutable
as $$
  select p_kind in ('ask', 'reread')
$$;

-- Most recently changed recipes first, at most what is left of each household's day (import_job_rules counts
-- the same jobs: non-background, created in the last 24 hours), never twice for a recipe already waiting.
create or replace function public.queue_rereads()
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
    where exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id and i.product_id is null)
      and not exists (select 1 from public.import_jobs j
                      where j.kind = 'reread' and j.subject_id = r.id and j.status in ('queued', 'processing'))
  ), queued as (
    insert into public.import_jobs (household_id, kind, subject_id, input_text, created_by)
    select w.household_id, 'reread', w.id, w.title, null
    from wanted w
    left join used u on u.household_id = w.household_id
    where w.rank <= 60 - coalesce(u.n, 0)
    returning 1
  )
  select count(*)::int from queued
$$;
revoke execute on function public.queue_rereads() from public, anon, authenticated;
grant execute on function public.queue_rereads() to service_role;

select public.queue_rereads();
