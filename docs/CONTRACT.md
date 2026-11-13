# Mesa — build contract (MVP)

Working name: **Mesa**. iPhone app for a shared household: a grocery list as fast as Apple Notes,
recipe import (links, YouTube Shorts, Instagram, TikTok, websites, screenshots, pasted text),
"On the menu" recipes (table up_next) that fill the list, and "Done shopping" that logs purchases for step 2.

Step 2 is now part of the MVP (design "Cuisine & courses — MVP", Nov 2026): the Pantry tab, "Put away"
when shopping is done, Cooked! with pantry deduction, and Tonight's idea (Inspire me) on Home.
Migration `20261105000007_pantry.sql` adds the functions they use. The expert-panel lots (Nov 2026) add:
`…08_pantry_upkeep.sql` (one rule for "at home", staples per household, stocking by hand, corrections),
`…09_realtime.sql` (live sync between the household's phones), `…10_scans.sql` (Kitchen Sweep and
Ticket In: proposals reviewed in the app, private `scans` bucket, prices in MXN), `…11_import_feedback.sql`
(import stages, codes, per-person pushes), `…12_pantry_amounts.sql` (amounts you can correct),
`…13_catalog_looks.sql` (generated: `products.family` = Pantry section, `products.picto` = drawing; see
`packages/shared/src/looks.ts`) and `…14_pantry_by_type.sql` (`pantry_status` gives family and picto; a manual
add makes a recipe line yours, so `unplan` keeps it; `unplan` never leaves "0 g"),
`…15_safety_and_tidy.sql` (import jobs only point to the household's own files; the app may only queue,
retry (status/error/error_code/stage/stage_at) or delete them; 60 imports a day; invite codes work once;
a job queued 20 min fails with `aiBusy` (pg_cron); tidy jobs; `recipe_steps.start_s`; private `backups`
bucket) and `…16_ai_everywhere.sql` (`input_image_paths`, idea / translate jobs, `import_jobs.result`,
`recipe_translations`, `client_errors`) and `…17_creators.sql` (`recipes.source_author / source_channel_url /
source_channel_id`, `followed_creators`, kind `creator`), `…18_creator_news.sql` (`creator_videos`, daily
`follow_check`) and `…19_smart_kitchen.sql` (`is_background_kind`, `suggestions`, kinds for_you / find / plan /
adapt / ask, `input_context`) and `…20_ask_fast_lane.sql` (`is_quick_kind` = ask, `claim_import_job(p_lane)`,
`import_jobs.draft`: Ask Mesa's answer as it is written) and `…21_vague_products.sql` (`is_vague_name`,
`ingredient_label`, `repair_vague_products()` (service role): recipe lines that an import had pointed to a vague
household product such as "Other" or "Sauce" get their own name back; see `packages/shared/src/generic.ts`)
and `…22_reread_ingredients.sql` (kind `reread`: "Redo ingredients"; `is_quick_kind` = ask, reread;
`queue_rereads()` (service role), run once by the migration: a reread for every recipe with a line linked to no
product, within each household's 60 jobs of the day), `…23_reread_all.sql` (every recipe read again once),
`…24_job_kinds.sql` (the `job_kinds` registry, server work after people's, a fair claim; 'adapt' removed) and
`…25_live_edits.sql` (writing a recipe's lines or steps touches `recipes.updated_at`; `products.updated_at`).

**The latest schema in one file: `db-tests/schema.sql`** (written by `db-tests/run.sh` after every migration:
`pg_dump --schema-only` of `public`, then the `job_kinds` rows; committed). Read it instead of replaying the
migrations; never edit it by hand.

## Repository

```
mesa/
  apps/mobile        Expo app (iOS first), package name @mesa/mobile
  apps/worker        Import worker (Node 22, TypeScript), package name @mesa/worker
  packages/shared    Pure TypeScript, no runtime deps; package name @mesa/shared
  supabase/migrations  SQL source of truth (already written and tested)
  db-tests           SQL tests on a local Postgres (bash db-tests/run.sh)
  infra/vps          docker compose for the worker + nightly backup
  docs               this contract, design system notes
```

pnpm workspaces, `node-linker=hoisted` (.npmrc). TypeScript strict everywhere
(`tsconfig.base.json`). `@mesa/shared` is consumed as TypeScript source
(`"main": "src/index.ts"`, `"types": "src/index.ts"`); the worker bundles it with tsup,
Metro transpiles it in the app.

## Database (Supabase) — already done, do not change without reason

Read `db-tests/schema.sql` (the migrations add up to it); row types are in `packages/shared/src/rows.ts`
(`jobs.ts` for import_jobs, `results.ts` for what jobs answer; all re-exported by `types.ts` and the index).
Key points:

- Every household table has `household_id` with a column default `current_household_id()`.
  **The app never sends household_id** on insert; RLS fills/checks it.
- Unit codes stored: `g, ml, unit, tbsp, tsp, cup, can, bunch, pack, clove, pinch, slice` or null.
  Mass is always stored in g, volume in ml.
- Categories (aisle order for display): `produce, bakery, meat, dairy, frozen, cupboard, drinks, household, other`.
- Storage bucket `recipe-images` (public read): recipe pictures only, written by the worker (the app may only
  remove its kitchen's). Object path: `<household_id>/<uuid>.<ext>` (jpeg/png/webp, ≤ 10 MB).
  Public URL: `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}`.
  `recipes.image_path` holds that path, or an absolute `https://` URL.
- Storage bucket `scans` (private, the household's folder only): everything people show Mesa — screenshots and
  shared photos of recipes, receipts, fridge photos and videos (≤ 50 MB). The worker deletes what a finished job
  used, and anything a day old (`shared_media_to_delete`, migration 28); a dish photo it keeps is copied into
  `recipe-images`.

RPCs (call with `supabase.rpc(name, args)`):

| Function | Args | Returns | Notes |
| --- | --- | --- | --- |
| `create_household` | `p_name text` | uuid | first-time setup |
| `create_invite` | — | text (10 chars of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) | share with partner; replaces the kitchen's previous code; valid 7 days |
| `join_household` | `p_code text` (case, spaces and dashes ignored) | uuid, or null when the code opens nothing | a wrong code is counted: the 11th in an hour raises P0001 "Too many tries. Wait an hour, or ask for a new code." |
| `add_grocery_item` | `p_label, p_product_id, p_quantity, p_unit, p_category, p_source` | grocery_items row | merges with an existing to_buy line |
| `mark_have` | `p_item_id uuid` | void | "Already have": removes from list, logs it |
| `complete_shopping` | `p_put_away jsonb` (`[{id, zone, expires_on}]`, optional) | int | every `in_cart` item → bought + pantry, where and until when the person chose (else the product's defaults) |
| `usual_products` | `p_limit int` | rows (product_id, name_en, category, times) | for "Usual" chips |
| `plan_recipe` | `p_recipe_id uuid, p_servings int` (null = household default) | uuid (up_next id) | adds what is missing, scaled: skips staples and what is at home; one line per product (`recipe_needs`) |
| `unplan` | `p_up_next_id uuid` | void | removes what only this recipe added |
| `mark_cooked` | `p_up_next_id uuid` | void | step 1 only (the app now uses `cook_recipe`) |
| `cook_recipe` | `p_recipe_id uuid, p_servings int` | rows (product_id, label, category, used, unit, left_quantity, left_level, ran_out, saved) | takes the ingredients out of the pantry (soonest expiry first), each product once with its lines added up, puts what ran out on the list, leaves the menu (up_next), sets last_cooked_at |
| `recipe_coverage` | — | rows (recipe_id, have_count, need_count, pantry_count, soon_names) | per recipe: at home vs to buy, each product once; drives Tonight's idea and "1 to buy" |
| `recipe_needs` | `p_recipe uuid` | rows (product_id, name, quantity, unit, first_position) | the recipe's non-optional lines, one row per product (lines without a product one each); the amounts added up when every line has one in the same unit, else null |
| `pantry_has` | `p_household uuid, p_product uuid` | boolean | a row at home (not out, not empty, not past its date by 3+ days), or a staple of the household not marked out |
| `use_soon_by` | — | date | today + 3: "use soon" |
| `ingredient_availability` | `p_recipe_id uuid` | rows (ingredient_id, at_home, soon, always_have) | Have / To buy on the recipe screen |
| `add_to_pantry` | `p_items jsonb` | int | "+" sheet, starter basics, "I have it"; unknown labels become household products |
| `set_pantry_item` | `p_item uuid, p_level, p_zone, p_expires_on, p_clear_expiry` | uuid | corrections; moving to a zone that has the product merges |
| `set_pantry_quantity` | `p_item uuid, p_quantity numeric, p_unit text` | uuid | exact amount ("2 pcs", "500 g"); null clears it; 0 is refused (use `pantry_out`) |
| `pantry_out` | `p_product uuid, p_add_to_list bool` | uuid (grocery line) | used up, also for staples |
| `set_always_have` / `always_have_list` | `p_product, p_value` / — | — / rows | per-household staples |
| `apply_pantry_proposal` | `p_proposal_id uuid, p_line_ids uuid[], p_edits jsonb` (`[{id, quantity, unit}]`, optional) | int | applies the ticked lines of a sweep / receipt, once, with the amounts fixed in the review; a sweep's amount replaces what was there; 0 = out (sweep) or not bought (receipt) |
| `dismiss_pantry_proposal` | `p_proposal_id uuid` | void | |

View `pantry_status` (security invoker): every pantry row with its product, `state`
(ok | soon | check | gone | out), `family` and `picto` (null for household products: the app uses `familyOf` / `pictoOf`). The app reads the pantry from it, so the rules live in SQL only.
| `claim_import_job` | `p_lane text` (`'any'` default, `'quick'`) | import_jobs rows (0 or 1) | worker only (service role). See "The queue" below. Another lane raises 22023. Sets `claimed_lane`; clears `draft` on claim and requeue |
| `save_imported_recipe` | `p_job uuid, p_attempt int, p_recipe jsonb, p_ingredients jsonb, p_steps jsonb` | uuid (recipe) | worker only. The recipe, its lines and steps in one transaction, for the run holding the job (processing, that attempt; else P0004 "job moved on"); a job that has its recipe (`recipes.import_job_id`) gets it back |
| `apply_reread` | `p_recipe uuid, p_read_at timestamptz, p_rows jsonb` | boolean | worker only. Writes the lines read again (name, product, amount, flags, position: never raw_text or section) when `recipes.updated_at` is still `p_read_at`, under the recipe's row lock; false and nothing written otherwise |
| `shared_media_to_delete` | `p_limit int` | rows (bucket, path) | worker only. What the media sweep removes (see Storage) |
| `record_ai_usage` | `p_calls int, p_input_tokens bigint, p_output_tokens bigint` | ai_usage row | worker only. Adds a model call to today's (UTC) totals and returns them |

Checking an item = `update grocery_items set status='in_cart', checked_at=now()`;
unchecking = `status='to_buy', checked_at=null`. Direct table access is fine for reads and simple updates.

Writing a recipe's `recipe_ingredients` or `recipe_steps` (insert, update, delete) bumps `recipes.updated_at`
once per statement (migration 25): live sync, which listens to `recipes`, refreshes the other phone.

Ingredient sections (migration 26): `recipe_ingredients.section` is the part of the recipe a line belongs to, as the
recipe names it ("Marinade", "Sauce"), trimmed, at most 60 characters; null for a recipe with one list. Lines of a
section follow each other. The editor shows a heading line ending with ":" where the section changes and reads it
back the same way (`linesWithHeadings` / `readSections`). Counting at home / to buy, Cooked! and planning take a
product once per recipe (`recipe_needs`); the recipe page marks each line.

### What the app may do with a job (migration 27)

- **Insert:** the input only (`kind`, `input_url`, `input_text`, `input_image_path(s)`, `zone`, `subject_id`,
  `input_context`, `preview_title`). A trigger sets every other column as a new job's, whatever was sent: queued,
  `created_at = now()` (no backdating), 0 attempts, no result, error, stage or recipe.
- **Update:** only Try again — `status` from `failed` to `queued`, of a kind that is not background. Anything
  else raises 42501 "Only a failed job can be tried again." `attempts` never goes back: it fences the runs.
- **Quota:** each job a person queues and each Try again takes one of the household's 60 a day (UTC) in
  `household_usage`, a count that never goes down (deleting jobs gives nothing back); the 61st raises P0001
  "Too many imports today. Try again tomorrow." `people_jobs_today` reads it. Signed-out visitors (anon) have no
  access to `import_jobs`.
- **Tidying:** one queued `tidy` per household; it takes everything waiting (`tidy_asked_at` marks what was asked).

### Job kinds and the queue (migration 24)

`job_kinds` (kind, lane `quick | any | background`, `counts_toward_quota`, `expires_in_queue`) holds the same rows
as `JOB_KINDS` in `packages/shared/src/job-kinds.ts`; `import_jobs.kind` references it (a kind outside it is refused,
SQLSTATE 23503). The app reads it, never writes it. `is_background_kind` / `is_quick_kind` read it.

- **A person's job** has `created_by` (the app's inserts always do: the policy requires `created_by = auth.uid()`,
  the column's default). **The server's** (tidy, follow_check, for_you, migrations 22/23's rereads) has none.
- Quota: 60 a day per household, counting only a person's jobs of a kind that counts (`household_usage`, see
  "What the app may do with a job").
  Expiry: only a person's queued job of a kind that expires fails with `aiBusy` after 20 minutes.
- Claim order (`claim_import_job`): rank 0 a person's quick job, 1 a person's other job, 2 the server's job of a
  people lane (rereads), 3 background work; within a rank, the household served longest ago first (round robin on
  its latest `started_at`), then the oldest job. `quick` takes only rank 0. In `any`, a household runs one job at
  a time (`claimed_lane = 'any'`): its next person's job waits for its running person's job (never for server
  work), its server work waits for anything it runs there. Claims are serialized (transaction advisory lock).

## @mesa/shared API (packages/shared/src/index.ts)

```ts
export * from './types';                    // rows.ts (tables), jobs.ts (ImportJob), results.ts (JobResults, what jobs answer)
// import jobs: one registry of kinds (the job_kinds table holds the same rows)
JOB_KINDS: Record<ImportKind, JobKindSpec>  // { lane, countsTowardQuota, expiresInQueue, failure, keeps, failureTitle, readyTitle }
type ImportKind = keyof typeof JOB_KINDS;  IMPORT_KINDS: ImportKind[];  JOB_LANES: JobLane[]
isImportKind(v: unknown): v is ImportKind;  jobKind(kind): JobKindSpec
// why a job failed: import_jobs.error_code is an ErrorCode, import_jobs.error is MESSAGES[code]
MESSAGES: Record<ErrorCode, string>;  isErrorCode(v: unknown): v is ErrorCode
// text
normalizeText(s: string): string            // lowercase, strip accents, trim, collapse spaces
singularize(word: string): string           // en/es/fr simple rules ("aguacates"→"aguacate", "tomatoes"→"tomato")
capitalize(s: string): string
// vague names: never a household product, a known name offered to a model, or a household match
isGenericName(name: string): boolean        // "Other", "misc", "Sauce", "spices", "other items" → true; "fish sauce" → false
isVaguePhrase(product: { household_id }, phrase: string): boolean  // a household product/alias with a vague name (buildCatalogIndex skips it)
// units
parseUnit(token: string): { unit: Unit; factor: number } | null   // "kg"→{g,1000}, "cdta"→{tsp,1}, "lata"→{can,1}
unitFamily(unit: Unit | null): UnitFamily
scaleQuantity(q: number | null, fromServings: number, toServings: number): number | null
roundForShopping(q: number | null, unit: Unit | null): number | null  // same rule as SQL round_for_shopping
formatQuantity(q: number | null, unit: Unit | null, word?: string | null): string
  // "500 g", "1.5 kg", "2", "¾", "1½", "2 tbsp", "1⅛ tbsp", "½ cup", "¾ thumb" (word: the line's own measure when unit is null), ""
  // counts never show decimals: under 1 → ¼ ⅓ ½ ⅔ ¾; from 1 → whole, or x½ within a quarter of the half (2.25 → "2", 3.75 → "4");
  // tbsp/tsp/cup → nearest of ⅛ ¼ ⅓ ½ ⅔ ¾; g/ml metric with at most 2 decimals
// ingredient sections ("Marinade", "Sauce"): recipe_ingredients.section, heading lines ending with ":" in the editor
MAX_SECTION_CHARS = 60
cleanSection(value: unknown): string | null        // "  Beef marinade: " → "Beef marinade"; null when empty
sectionHeading(line: string): string | null        // "For the sauce:", "[Sauce]", "## Sauce", "**Sauce**", "— Sauce —" → the name; "Salt: to taste", "[1 cup]" → null
headingLine(section: string): string               // "Sauce" → "Sauce:"
groupBySection<T extends { section }>(rows: T[]): { section: string | null; rows: T[] }[]   // consecutive rows
linesWithHeadings<T extends { section }>(rows: T[], text: (row: T) => string): string[]      // editor text
readSections(lines: string[]): { line: string; section: string | null }[]                    // editor text back
meaningfulSections(sections: (string | null)[]): (string | null)[]   // fewer than two distinct → all null
inSectionOrder<T extends { section }>(rows: T[]): T[]   // an import's lines: no-section first, then each section together (editor round-trips)
// parsing
interface ParsedItem { label: string; quantity: number | null; unit: Unit | null; raw: string }
parseGroceryInput(text: string): ParsedItem[]   // splits on newlines, commas, semicolons, bullets; reads quantities
parseIngredientLine(line: string): ParsedItem   // one recipe line, "2 cdas de aceite" → {label:"aceite", 2, tbsp}
measureWord(line: string, name: string): string | null   // a measure with no unit code: "1 thumb ginger" → "thumb"
// catalog
interface CatalogIndex { /* opaque */ }
buildCatalogIndex(products: Product[], aliases: ProductAlias[]): CatalogIndex  // skips vague household products and aliases
matchProduct(index: CatalogIndex, label: string): Product | null  // longest alias match wins
// aisles
AISLE_ORDER: Category[]
CATEGORY_LABEL: Record<Category, string>   // "Produce", "Bakery", "Meat & fish", "Dairy & eggs", "Frozen", "Cupboard", "Drinks", "Household", "Other"
// looks (Pantry sections and drawings)
FAMILIES: Family[]; FAMILY_LABEL: Record<Family, string>   // "Vegetables", "Fruit", "Herbs & chiles", "Dairy & eggs", …
PICTOS: Picto[]                                          // "tomato", "chile", "tortilla", "egg", …
familyOf(p: { family?, category }): Family               // the product's own, else from its category
pictoOf(p: { picto?, category }): Picto
```

The catalog (≈150 products, aliases en/es/fr) lives in `packages/shared/catalog/catalog.json`
and is turned into `supabase/migrations/20261105000005_catalog.sql` by `pnpm --filter @mesa/shared gen:catalog`.
The app and worker load products + aliases from the database at runtime.

**A new kind of job** touches: its `JOB_KINDS` entry (`ImportKind` follows); its failure sentence in `errors.ts` and
its answer in `results.ts` (`JobResults`) when it has them; its handler in `apps/worker/src/handlers/index.ts`
(the build fails until every kind has one; an asked kind also gets its ready push in `ready-pushes.ts`); and a new
migration with `pnpm -s --filter @mesa/shared gen:job-kinds` (the upsert of every kind), plus whatever it needs
to be queued. Then run the db tests: `db-tests/schema.sql` is refreshed, and `test/job-kinds.test.ts` (shared)
fails while the registry and the table differ.

## Worker (apps/worker)

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_FALLBACK_MODELS` (comma-separated, default `gemini-3.6-flash,gemini-3.5-flash`; used when the main model is busy or retired),
`POLL_INTERVAL_MS` (default 3000), `YTDLP_PATH` (default `yt-dlp`), `YTDLP_COOKIES` (optional path),
`WORKER_CONCURRENCY` (default 1: slots of the `any` lane), `WORKER_QUICK_SLOTS` (default 1, 0 = none: extra slots
that only take a person's quick kinds, so a question never waits behind an import or a video search).

Optional: `HEALTHCHECK_URL` (pinged about once a minute while the queue answers; healthchecks.io).

Loop: each slot calls `rpc('claim_import_job', { p_lane })` (sets `stage='opening'`; the order is "Job kinds and
the queue" above: people's quick kinds first, one job per household at a time, households in turn, background last). An idle slot waits `POLL_INTERVAL_MS`, or less: the worker listens to Realtime
INSERTs on `import_jobs` (service role, Node's own WebSocket) and wakes idle slots at once. Best effort: a channel
that fails or closes is logged (`wake_channel_trouble`, `wake_unavailable`) and the poll carries on. Then `runner.ts` runs it with its kind's handler (`handlers/index.ts`, one per `JOB_KINDS` entry; a kind without
one fails at once with `unknownKind`, no model call) under an 8-minute timeout. On shutdown every kind, background
work included, goes back to the queue. A failure stores `failureCode(kind, err)`: the code raised when the kind
keeps it (`keeps`, `aiBusy` always, `timeout` when it ran too long), else the kind's own `failure`; `error` is
`MESSAGES[code]` (a background job keeps the error's detail instead: nobody is shown it). When to push is
`notify.ts`: `always` (a scan's proposal, a failed import or scan), `after_wait` (a recipe ready after 15 s),
`if_asked` (an asked job: someone asked, waited 15 s and did not cancel), `never` (background). By kind:
- `recipe` → a link the household already saved (same `recipes.source_url`) is done at once with
  `already_saved=true, recipe_id`; otherwise write recipe → `status='done', recipe_id`, and a push
  "Ready in Recipes" when the wait was over 15 s. A shared photo that is not a recipe is read as a receipt
  (`proposal_id` on the recipe job).
- `sweep` (a video/photo of `zone` in the `scans` bucket) or `receipt` → `pantry_proposals` + lines →
  `status='done', proposal_id`, and a push "ready to review".
- `tidy` (queued by triggers when a household product is created, or a list line with no product lands in
  "other") → one AI call per household batch fills empty `family`, `picto`, aisle, `default_zone`,
  `shelf_life_days`, `unit_family` and adds aliases; a list line may be linked to a known product. Silent.
- `idea` (`subject_id` = product, `input_text` = its name) → `result` = UseItUpIdeas (3 dishes, uses checked
  against `pantry_status`). `translate` (`subject_id` = recipe, `input_text` = ISO 639-1) → `recipe_translations`.
  Asked kinds: a push only when the person stopped waiting (`if_asked`).
- Several screenshots (`input_image_paths`) are read as one recipe in a single call.
- Every import stores who made it (`source_author`, and the YouTube channel URL / id when known).
- `creator` (`input_url` = a YouTube channel / @handle / playlist, or `subject_id` = a saved YouTube recipe) →
  `result` = CreatorVideos: the channel's latest videos (yt-dlp flat listing, Shorts and clips < 90 s left out),
  one AI call keeps the recipe videos and names the dish, `saved` marks those already in Recipes. A channel
  or playlist link sent as a plain recipe import fails fast with `creatorLink`.
- Background kinds (`is_background_kind`: tidy, follow_check, for_you) run only when nothing else waits, never
  count toward the 60-a-day cap and never expire in the queue. `follow_check` (daily, pg_cron) keeps followed
  creators' recipe videos in `creator_videos` (first look = baseline, then new ones `is_new`). `for_you` (Monday,
  pg_cron) writes 5 `suggestions`: 1 AI call for searches from the household's taste, yt-dlp search + page checks
  (≤ 25 calls, stop on bot checks), 1 AI call to judge and explain, ranked by fit, engagement for the channel's
  size, creator trust and novelty.
- Asked kinds answer in `result` and push when the wait was long (`{jobId, kind}`; translate, reread and an ask
  about a recipe add `recipeId`): `find` → FoundVideos (same pipeline, from a wish), `plan` → WeekPlan (only saved
  recipes), `ask` → AskAnswer (grounded in the kitchen; actions the app runs only when tapped; adapting a recipe is
  a question about it). None of them invents a recipe. An asked job with no `created_by` (queued by the server,
  e.g. migration 22's rereads) pushes nobody.
- `reread` ("Redo ingredients"; `subject_id` = a recipe of the job's household, else `rereadFailed`;
  `input_text` = its title, a label) → `result` = RereadResult `{lines, linked}` (every line, and those linked to
  a product). Quick lane. The lines (`recipe_ingredients.raw_text`, ordered by position) are read again as an
  import reads a website's lines (`readIngredientLines`: `parseIngredientLine` for amounts, one `translateNames`
  call, with the known names those lines mention, for the lines no catalog name matches exactly), then mapped and given
  household products exactly as an import (`resolveIngredients` in writer.ts: `planIngredients`, vague-name
  guards). Every line is kept, same id, in order (positions renumbered 0…n-1), `raw_text` untouched: a line
  nothing names (no letters, no label) stays as it was; a line read again takes its new name, product, amount
  and optional flag, except that a stored amount stays (with its `is_guessed`) when the text says none, and a
  stored "optional" stays. One upsert by id writes them all (all or nothing), refused if the editor saved the
  lines meanwhile; the write touches `recipes.updated_at` (migration 25), so live sync refreshes both phones. A failed model call
  fails the job (`rereadFailed`, or `aiBusy`) and leaves the lines as they were. Log line `reread_done`
  (lines, linked, unchanged, changed, created_products). Title, steps, favorite, history and `original` are
  never touched.
- `ask` is answered as it is written: one streamed call with low thinking; while it runs, `draft` holds the
  answer's words so far (written at most every ~350 ms and once more when the answer is complete; it starts over
  on a retry or another model). Then `result` (checked as always) and `draft = null` in the same update; a failed
  or requeued job clears it too. Only the worker writes `draft`; the app reads it (Realtime UPDATE) and shows
  `result` once `status='done'`.
Progress (best effort, never fails a job): `stage` (`opening` → `downloading` → `watching` | `reading` →
`writing`) with `stage_at`, and `preview_title` / `preview_image_url` as soon as the page or video says them.
Failures: `status='failed', error` (the sentence shown), `error_code` (the `MESSAGES` key, an `ErrorCode` of
`@mesa/shared`; the app picks the way out from it: retry, screenshot, paste, open the post). The worker's
`ImportError` carries the code itself; nothing is matched by its sentence.
Pushes go to the phones of `import_jobs.created_by` (`push_tokens.user_id`), or the whole household for
older rows. Push `data`: `{recipeId}` · `{proposalId}` · `{jobId, kind}` (the app opens the matching screen).

Deploy order for migration 20: the migration first (`claim_import_job()` without arguments still works: `p_lane`
defaults to `'any'`, so the running worker keeps claiming, now quick kinds first), then the worker (it calls
`claim_import_job` with `p_lane` and clears `draft` on every job end, which an older database refuses).

Deploy order for migration 22: **the worker first, then the migration, then the app.** The migration queues the
one-time rereads as it runs, and `is_quick_kind` hands them to whichever slot is free at once, quick lane
included. A worker without `reread` would take them for recipe imports (the title read as pasted text: an AI call
each, maybe an invented duplicate recipe, or a "Couldn't save this recipe" push to every phone of the household,
since these jobs have no `created_by`). The new worker needs nothing from migration 22: until it runs, nobody can
queue a reread (the kind check refuses it). The app's "Redo ingredients" needs the migration (same check). The
one-time batch goes first in the queue (quick kinds, oldest first): questions and imports asked right after the
migration wait behind it for a minute or two; a reread still queued after 20 minutes fails with `aiBusy`, like
any asked job. It can use a household's whole day (60 jobs) when that many recipes have an unlinked line.

### Migration 23 — every recipe read again once (`20261107000023_reread_all.sql`)

The worker's mapping now keeps each line's own words on a linked row (`name` = the line's specific name:
"Dark soy sauce", "Chicken stock", "White onion"; the product is only the link) and no longer counts "dark" as a
neutral qualifier (dark soy sauce is not Soy sauce). `queue_all_rereads(p_keep int default 15)` (service role only)
queues one `reread` per recipe that has lines, except one read again in the last hour or waiting, newest first,
leaving `p_keep` of the day's 60 jobs to the people; it runs once in the migration. Deploy order: the worker first
(the new rules), then the migration. No app change.

### Worker structure

- `index.ts` wires everything once: config, the Supabase client, `RecipeAI` (Gemini) behind `ModelPort`, the
  `CatalogStore`, the runner, the slots.
- Jobs: `job-store.ts` (claim; done / failed / requeue, with retries), `runner.ts` (one job: its handler, the
  timeout, the failure code, back to the queue on shutdown), `notify.ts` (when to tell) with `push.ts` (Expo)
  and `ready-pushes.ts` (an asked job's ready push), `handlers/` (one per kind: `recipe.ts`, `scan.ts`,
  `asked.ts`, `background.ts`; `index.ts` is the composition root).
- Ports: `model-port.ts` (`ModelPort` = `JsonModel` & `RecipeModel` & `FileModel`; requests in `ModelPart` and
  `ModelSchema` (`model-schema.ts`); one error contract for every method: an `ImportError` with its code, or an
  abort; `ModelRefusedError` when the model would not take the input, so YouTube falls back to a download).
  `gemini.ts` is its one implementation (with `gemini-errors.ts`, the only code that knows `@google/genai`
  besides `index.ts`). `ports.ts`: what each job is given, never the config: `KitchenJobDeps` (idea, ask, plan,
  tidy), `TranslateDeps`, `RereadDeps`, `ScanDeps`, `ImportDeps` (recipe). Not narrowed yet: `creator`, `find`,
  `for_you` and `follow_check` still take `PipelineDeps` (for the yt-dlp options in the config).
- Safety and costs (migrations 27–28):
  - `safe-fetch.ts`: every page and image the worker fetches goes through undici with a DNS lookup that refuses
    loopback, private, link-local, CGNAT, ULA, multicast and reserved addresses; redirects followed by hand (at most
    5), each hop http(s) on its default port, IP literals checked too. yt-dlp only ever gets known video hosts
    (`videoLink` in `ytdlp.ts`); its generic extractor can still follow what such a host points to (an egress
    firewall on the VPS would close that).
  - `job-media.ts`: a job's photos and videos, read from the private `scans` bucket (then `recipe-images`, for jobs
    an older app queued); only paths in the job's household folder. `media-sweep.ts`: at startup and every 15
    minutes, removes what `shared_media_to_delete` lists.
  - `job-store.ts`: a run ends its job only while it holds it (`status = 'processing'` and its claimed `attempts`);
    otherwise `job_moved_on` is logged and nothing is written. `writer.ts` saves a recipe with
    `save_imported_recipe`; `handlers/recipe.ts` first finishes with the recipe a job already wrote (no AI call).
    `reread.ts` writes with `apply_reread`. `tidy.ts`: up to 25 products and 25 list lines per call, stamped
    `tidy_asked_at` after the answer; a full batch queues one more tidy.
  - `ai-budget.ts`: the day's (UTC) model calls and tokens (`ai_usage`), checked before every call; past
    `AI_DAILY_TOKEN_LIMIT` (default 20,000,000, input + output) or `AI_DAILY_CALL_LIMIT` (default 3,000) every call
    fails with `aiDailyLimit` until midnight UTC (never retried, never another model; the runner keeps the code for
    every kind). `request-tries.ts`: at most 3 paid tries per request, one retry after an unreadable answer.
  - `slot.ts`: after a job the server queued (`created_by` null) the slot rests `SERVER_JOB_GAP_MS` (default 30 s)
    before claiming again, unless a new job comes in: server work stays under the model's per-minute limits.
  - `section-guess.ts`: Redo ingredients on a recipe with no section (6 lines or more) asks the model for its parts
    from the lines and the steps (one `askJson`, 'sections'); a simple list gets none; a failure goes on without.
    `reread.ts` then orders the lines part by part (`withParts`).
  - `ingredient-sections.ts`: an import's sections (`cleanSection`, `meaningfulSections`, `inSectionOrder`); a
    website's heading lines ("For the sauce:") become sections, a "To serve" section's lines optional.
- Repositories: `repos/kitchen.ts` (`pantryRows`: every `pantry_status` read; `listLines`: every shopping-list
  read), `repos/recipes.ts` (a household's recipe by link). `prompt-dates.ts` says "Today is …" for every prompt
  (in UTC: the household's time zone is not stored).
- Catalog (`catalog-store.ts`): the shared catalog is loaded at startup and every 30 minutes; a household's own
  products (with their aliases) on its first job, kept for 32 households (least recently used out) and loaded
  again when `count:max(updated_at)` of its products moved (one small query per use; migration 25). Product
  names offered to the model (`known-names.ts`): those the text names (word overlap; household products first,
  at most 150); with no text (a photo, a video without caption) the household's, then the catalog's (at most 400).

### Migrations 24–25 — deploy order (`20261107000024_job_kinds.sql`, `20261107000025_live_edits.sql`)

**The migrations first (24 then 25), then the worker. No app change is needed for either.**
- The running worker keeps working on the new database: `claim_import_job(p_lane)` keeps its arguments and returns
  the same rows (plus `claimed_lane`, which it ignores); the quick lane now hands it only a person's quick jobs,
  the any lane one job per household in turn; it never queues jobs, so the kind foreign key does not concern it;
  'adapt' rows are deleted (it read them as recipe imports); its reread still bumps `recipes.updated_at` itself
  (the trigger does too); its catalog load selects columns that did not change.
- The new worker needs migration 25: its catalog cache reads `products.updated_at`. On an older database every
  job fails while loading the household's products. Rolling back: the worker before migration 25.
- The app: its inserts never send `created_by` (the default `auth.uid()` satisfies the new policy) and it no
  longer queues 'adapt'. Ingredient and step edits now reach the other phone through `recipes` (the app's live
  sync already listens to it).

### Migrations 26–28 — deploy order (`…26_ingredient_sections.sql`, `…27_job_safety.sql`, `…28_invites_media_spend.sql`)

**The migrations first (26, 27, 28), then the worker, then the app update.**
- The running worker keeps working on the new database: lines it writes have no section; it writes recipes and
  rereads its old way (unfenced, as before); a tidy job without a subject tidies the household's products only;
  it reads screenshots from `recipe-images`, where only an older app still puts them.
- The new worker needs all three (`section`, `save_imported_recipe`, `apply_reread`, `tidy_asked_at`,
  `import_job_id`, `shared_media_to_delete`, `ai_usage`). Rolling back: the worker before migration 26.
- The app update needs migration 26 (it reads `section`) and the new worker (it uploads screenshots to `scans`).
  Until a phone takes the update, it can't share screenshots (migration 28 took its `recipe-images` uploads away),
  and a wrong invite code looks like it worked (`join_household` now returns null).

### Migration 29 — recipe parts (`20261107000029_recipe_parts.sql`)

`heading_of(line)` reads a heading line the way `sectionHeading` does. Run once: heading lines saved as ingredients
("[Marinade]", "Sauce:") became the section of the lines under them and went (`repair_heading_lines`); every recipe
of 6 lines or more without a section was queued for a server reread (`queue_part_rereads`: no quota, no push).
`apply_reread` now writes the sections it is sent, for a recipe that has none. **Deploy: the worker first, then the
migration** (it queues the rereads the new worker answers with parts); the app's heading forms come with its update.

### Migration 30 — one link per embed (`20261109000030_one_job_recipe_link.sql`)

An embed (`recipe:recipes(title)` inside a select) needs **exactly one foreign key** between the two tables: with
two, the API refuses the whole request (PostgREST PGRST201), the insert that reads its row back included. Migration
27 broke every import that way (`recipes.import_job_id` next to `import_jobs.recipe_id`); migration 30 keeps
`import_job_id` as a key with its unique index and drops its foreign key. `db-tests/test_api_links.sql` lists the
embeds the app and the worker make: a new embed goes there. **Deploy: the migration alone**, nothing else.

## App (apps/mobile)

Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
UI text in English. Design system: minimal and neutral, see `docs/DESIGN_SYSTEM.md`.
