# Mesa — build contract (MVP)

Working name: **Mesa**. iPhone app for a shared household: a grocery list as fast as Apple Notes,
recipe import (links, YouTube Shorts, Instagram, TikTok, websites, screenshots, pasted text),
"Up next" recipes that fill the list, and "Done shopping" that logs purchases for step 2.

Step 2 is now part of the MVP (design "Cuisine & courses — MVP", Nov 2026): the Pantry tab, "Put away"
when shopping is done, Cooked! with pantry deduction, and Tonight's idea (Inspire me) on Home.
Migration `20261105000007_pantry.sql` adds the functions they use. The expert-panel lots (Nov 2026) add:
`…08_pantry_upkeep.sql` (one rule for "at home", staples per household, stocking by hand, corrections),
`…09_realtime.sql` (live sync between the household's phones) and `…10_scans.sql` (Kitchen Sweep and
Ticket In: proposals reviewed in the app, private `scans` bucket, prices in MXN).

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

Read `supabase/migrations/*.sql`; row types are in `packages/shared/src/types.ts`.
Key points:

- Every household table has `household_id` with a column default `current_household_id()`.
  **The app never sends household_id** on insert; RLS fills/checks it.
- Unit codes stored: `g, ml, unit, tbsp, tsp, cup, can, bunch, pack, clove, pinch, slice` or null.
  Mass is always stored in g, volume in ml.
- Categories (aisle order for display): `produce, bakery, meat, dairy, frozen, cupboard, drinks, household, other`.
- Storage bucket `recipe-images` (public read). Object path: `<household_id>/<uuid>.<ext>`.
  Public URL: `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${path}`.
  `recipes.image_path` holds that path, or an absolute `https://` URL.

RPCs (call with `supabase.rpc(name, args)`):

| Function | Args | Returns | Notes |
| --- | --- | --- | --- |
| `create_household` | `p_name text` | uuid | first-time setup |
| `create_invite` | — | text (6 chars) | share with partner |
| `join_household` | `p_code text` | uuid | error P0002 if invalid |
| `add_grocery_item` | `p_label, p_product_id, p_quantity, p_unit, p_category, p_source` | grocery_items row | merges with an existing to_buy line |
| `mark_have` | `p_item_id uuid` | void | "Already have": removes from list, logs it |
| `complete_shopping` | `p_put_away jsonb` (`[{id, zone, expires_on}]`, optional) | int | every `in_cart` item → bought + pantry, where and until when the person chose (else the product's defaults) |
| `usual_products` | `p_limit int` | rows (product_id, name_en, category, times) | for "Usual" chips |
| `plan_recipe` | `p_recipe_id uuid, p_servings int` (null = household default) | uuid (up_next id) | adds what is missing, scaled: skips staples and what is at home |
| `unplan` | `p_up_next_id uuid` | void | removes what only this recipe added |
| `mark_cooked` | `p_up_next_id uuid` | void | step 1 only (the app now uses `cook_recipe`) |
| `cook_recipe` | `p_recipe_id uuid, p_servings int` | rows (product_id, label, category, used, unit, left_quantity, left_level, ran_out, saved) | takes the ingredients out of the pantry (soonest expiry first), puts what ran out on the list, leaves Up next, sets last_cooked_at |
| `recipe_coverage` | — | rows (recipe_id, have_count, need_count, pantry_count, soon_names) | per recipe: at home vs to buy; drives Tonight's idea and "1 to buy" |
| `pantry_has` | `p_household uuid, p_product uuid` | boolean | a row at home (not out, not empty, not past its date by 3+ days), or a staple of the household not marked out |
| `use_soon_by` | — | date | today + 3: "use soon" |
| `ingredient_availability` | `p_recipe_id uuid` | rows (ingredient_id, at_home, soon, always_have) | Have / To buy on the recipe screen |
| `add_to_pantry` | `p_items jsonb` | int | "+" sheet, starter basics, "I have it"; unknown labels become household products |
| `set_pantry_item` | `p_item uuid, p_level, p_zone, p_expires_on, p_clear_expiry` | uuid | corrections; moving to a zone that has the product merges |
| `pantry_out` | `p_product uuid, p_add_to_list bool` | uuid (grocery line) | used up, also for staples |
| `set_always_have` / `always_have_list` | `p_product, p_value` / — | — / rows | per-household staples |
| `apply_pantry_proposal` | `p_proposal_id uuid, p_line_ids uuid[]` | int | applies the ticked lines of a sweep / receipt, once |
| `dismiss_pantry_proposal` | `p_proposal_id uuid` | void | |

View `pantry_status` (security invoker): every pantry row with its product and `state`
(ok | soon | check | gone | out). The app reads the pantry from it, so the rules live in SQL only.
| `claim_import_job` | — | import_jobs rows (0 or 1) | worker only (service role) |

Checking an item = `update grocery_items set status='in_cart', checked_at=now()`;
unchecking = `status='to_buy', checked_at=null`. Direct table access is fine for reads and simple updates.

## @mesa/shared API (packages/shared/src/index.ts)

```ts
export * from './types';
// text
normalizeText(s: string): string            // lowercase, strip accents, trim, collapse spaces
singularize(word: string): string           // en/es/fr simple rules ("aguacates"→"aguacate", "tomatoes"→"tomato")
capitalize(s: string): string
// units
parseUnit(token: string): { unit: Unit; factor: number } | null   // "kg"→{g,1000}, "cdta"→{tsp,1}, "lata"→{can,1}
unitFamily(unit: Unit | null): UnitFamily
scaleQuantity(q: number | null, fromServings: number, toServings: number): number | null
roundForShopping(q: number | null, unit: Unit | null): number | null  // same rule as SQL round_for_shopping
formatQuantity(q: number | null, unit: Unit | null): string      // "500 g", "1.5 kg", "2", "2 tbsp", "½ cup", ""
// parsing
interface ParsedItem { label: string; quantity: number | null; unit: Unit | null; raw: string }
parseGroceryInput(text: string): ParsedItem[]   // splits on newlines, commas, semicolons, bullets; reads quantities
parseIngredientLine(line: string): ParsedItem   // one recipe line, "2 cdas de aceite" → {label:"aceite", 2, tbsp}
// catalog
interface CatalogIndex { /* opaque */ }
buildCatalogIndex(products: Product[], aliases: ProductAlias[]): CatalogIndex
matchProduct(index: CatalogIndex, label: string): Product | null  // longest alias match wins
// aisles
AISLE_ORDER: Category[]
CATEGORY_LABEL: Record<Category, string>   // "Produce", "Bakery", "Meat & fish", "Dairy & eggs", "Frozen", "Cupboard", "Drinks", "Household", "Other"
```

The catalog (≈150 products, aliases en/es/fr) lives in `packages/shared/catalog/catalog.json`
and is turned into `supabase/migrations/20261105000005_catalog.sql` by `pnpm --filter @mesa/shared gen:catalog`.
The app and worker load products + aliases from the database at runtime.

## Worker (apps/worker)

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_FALLBACK_MODELS` (comma-separated, default `gemini-3.6-flash,gemini-3.5-flash`; used when the main model is busy or retired),
`POLL_INTERVAL_MS` (default 3000), `YTDLP_PATH` (default `yt-dlp`), `YTDLP_COOKIES` (optional path).

Loop: `rpc('claim_import_job')` → process by `import_jobs.kind`:
- `recipe` → write recipe → `status='done', recipe_id`. A shared photo that is not a recipe is read as a receipt.
- `sweep` (a video/photo of `zone` in the `scans` bucket) or `receipt` → `pantry_proposals` + lines →
  `status='done', proposal_id`, and a push "ready to review".
Failures: `status='failed', error` (+ Expo push to the household's `push_tokens`).

## App (apps/mobile)

Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
UI text in English. Design system: Zician foundations, see `docs/DESIGN_SYSTEM.md`.
