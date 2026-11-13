// Tidy: things Mesa doesn't know get to know them. A product the household created (typed, put away,
// or met in a recipe) and a list line typed by hand start in "Other", in the cupboard, keeping forever.
// One tidy waits per household and takes everything waiting when it runs (migration 27): up to 25
// products and 25 list lines, one AI call for all their names, which fills what is empty: family and
// picto (Pantry), aisle, usual place, how long it keeps, how it is counted, and a few names in other
// languages; a line that is a known product under another name is linked to it. Whatever was asked is
// marked asked (tidy_asked_at), answered or not, so nothing is asked twice; more waiting queues one more
// tidy. It never merges products and never overwrites what is set: a wrong guess stays editable.
import { enumOf, nullable, Type, type ModelSchema } from './model-schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FAMILIES, PICTOS, isGenericName, normalizeText, type ImportJob } from '@mesa/shared';

import { knownNames } from './known-names';
import type { Logger } from './log';
import type { Catalog } from './mapping';
import { CATEGORIES } from './model-output';
import { textPart } from './pipeline-common';
import type { KitchenJobDeps } from './ports';

/** Untidied products, and untidied list lines, handled in one call (the rest wait for the next tidy). */
const BATCH = 25;
const ZONES = ['fridge', 'freezer', 'cupboard'] as const;
const UNIT_FAMILIES = ['count', 'mass', 'volume'] as const;
const ALIAS_LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt'] as const;


const TIDY_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'The name exactly as given.' },
          category: enumOf(CATEGORIES),
          family: enumOf(FAMILIES),
          picto: enumOf(PICTOS),
          default_zone: enumOf(ZONES),
          shelf_life_days: nullable({ type: Type.INTEGER, description: 'Days it keeps once bought, in that place; null if it keeps for months.' }),
          unit_family: enumOf(UNIT_FAMILIES),
          same_as: nullable({ type: Type.STRING, description: 'When it is one of the known products under another name: that product, exactly as listed.' }),
          aliases: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { lang: enumOf(ALIAS_LANGS), name: { type: Type.STRING } },
              required: ['lang', 'name'],
            },
          },
        },
        required: ['name', 'category', 'family', 'picto', 'default_zone', 'shelf_life_days', 'unit_family', 'same_as', 'aliases'],
      },
    },
  },
  required: ['items'],
};

export function tidySystemPrompt(known: readonly string[]): string {
  return `You sort grocery items for a household kitchen app used anywhere in the world. Each item is a food or
household product someone typed, in any language. For each one, return:
- category: the store aisle; family: the pantry section; picto: the drawing that looks most like it.
- default_zone: where it is usually kept at home; shelf_life_days: how many days it keeps there once bought
  (fresh herbs 5, tomatoes 7, milk 7, cheese 21, frozen food or dry goods: null).
- unit_family: how it is usually counted (count: pieces, bunches, packs; mass: grams; volume: millilitres).
- same_as: only when the item is plainly one of these known products under another name or language,
  that product exactly as written here; otherwise null:
${known.join(', ')}
- aliases: 2 to 6 common names for it in other languages (lowercase, singular), no brands, never a vaguer
  name ("sauce" or "salsa" for fish sauce).
Answer for every item, in the order given.`;
}

export interface TidyAnswer {
  category: (typeof CATEGORIES)[number];
  family: (typeof FAMILIES)[number];
  picto: (typeof PICTOS)[number];
  default_zone: (typeof ZONES)[number];
  shelf_life_days: number | null;
  unit_family: (typeof UNIT_FAMILIES)[number];
  same_as: string | null;
  aliases: { lang: string; name: string }[];
}

const oneOf = <T extends string>(values: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : null;

/** Answers keyed by normalized name; items with a missing enum are dropped (they stay as they are). */
export function normalizeTidy(raw: unknown): Map<string, TidyAnswer> {
  const out = new Map<string, TidyAnswer>();
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) return out;
  for (const it of items as Record<string, unknown>[]) {
    const category = oneOf(CATEGORIES, it.category);
    const family = oneOf(FAMILIES, it.family);
    const picto = oneOf(PICTOS, it.picto);
    const zone = oneOf(ZONES, it.default_zone);
    const unitFamily = oneOf(UNIT_FAMILIES, it.unit_family);
    if (typeof it.name !== 'string' || !category || !family || !picto || !zone || !unitFamily) continue;
    const days = typeof it.shelf_life_days === 'number' && Number.isInteger(it.shelf_life_days) && it.shelf_life_days > 0 && it.shelf_life_days <= 365
      ? it.shelf_life_days
      : null;
    const aliases = Array.isArray(it.aliases)
      ? (it.aliases as Record<string, unknown>[])
          .filter((a) => oneOf(ALIAS_LANGS, a.lang) && typeof a.name === 'string')
          .map((a) => ({ lang: a.lang as string, name: normalizeText(a.name as string) }))
          // "sauce" as a name for fish sauce would catch every sauce
          .filter((a) => a.name.length > 1 && a.name.length < 60 && !isGenericName(a.name))
          .slice(0, 8)
      : [];
    out.set(normalizeText(it.name), {
      category, family, picto, default_zone: zone, shelf_life_days: days, unit_family: unitFamily,
      same_as: typeof it.same_as === 'string' && it.same_as.trim() ? it.same_as.trim() : null,
      aliases,
    });
  }
  return out;
}

interface WaitingProduct {
  id: string;
  name_en: string;
  category: string;
  shelf_life_days: number | null;
}

interface WaitingLine {
  id: string;
  label: string;
}

/** The household's products without a family or a picto, never asked about. */
const productsWaiting = (db: SupabaseClient, householdId: string, columns: string, limit: number) =>
  db.from('products').select(columns).eq('household_id', householdId).or('family.is.null,picto.is.null').is('tidy_asked_at', null).limit(limit);

/** The household's lines typed by hand, still "Other" and to buy, never asked about. */
const linesWaiting = (db: SupabaseClient, householdId: string, columns: string, limit: number) =>
  db
    .from('grocery_items')
    .select(columns)
    .eq('household_id', householdId)
    .is('product_id', null)
    .eq('category', 'other')
    .eq('status', 'to_buy')
    .is('tidy_asked_at', null)
    .limit(limit);

async function waiting(db: SupabaseClient, householdId: string): Promise<{ products: WaitingProduct[]; lines: WaitingLine[] }> {
  const [products, lines] = await Promise.all([
    productsWaiting(db, householdId, 'id, name_en, category, shelf_life_days', BATCH),
    linesWaiting(db, householdId, 'id, label', BATCH),
  ]);
  if (products.error) throw new Error(`tidy products: ${products.error.message}`);
  if (lines.error) throw new Error(`tidy lines: ${lines.error.message}`);
  return { products: (products.data ?? []) as unknown as WaitingProduct[], lines: (lines.data ?? []) as unknown as WaitingLine[] };
}

/** Fills what is empty on one product, and adds its names in other languages. False when it failed. */
async function tidyProduct(db: SupabaseClient, householdId: string, p: WaitingProduct, a: TidyAnswer, log: Logger): Promise<boolean> {
  const { error } = await db
    .from('products')
    .update({
      family: a.family,
      picto: a.picto,
      default_zone: a.default_zone,
      unit_family: a.unit_family,
      ...(p.category === 'other' ? { category: a.category } : {}),
      ...(p.shelf_life_days === null && a.shelf_life_days !== null ? { shelf_life_days: a.shelf_life_days } : {}),
    })
    .eq('id', p.id)
    .eq('household_id', householdId);
  if (error) {
    log.warn('tidy_product_failed', { product: p.id, err: error.message });
    return false;
  }
  const aliases = a.aliases.filter((x) => x.name !== normalizeText(p.name_en)).map((x) => ({ product_id: p.id, alias: x.name, lang: x.lang }));
  if (aliases.length > 0) {
    const { error: aliasError } = await db.from('product_aliases').upsert(aliases, { onConflict: 'product_id,alias', ignoreDuplicates: true });
    if (aliasError) log.warn('tidy_aliases_failed', { product: p.id, err: aliasError.message });
  }
  return true;
}

/** Puts one list line in its aisle, linked to the known product it names, if any. False when it failed. */
async function tidyLine(db: SupabaseClient, householdId: string, line: WaitingLine, a: TidyAnswer, catalog: Catalog, log: Logger): Promise<boolean> {
  const same = a.same_as ? catalog.products.find((p) => p.name_en.toLowerCase() === a.same_as!.toLowerCase()) : undefined;
  const { error } = await db
    .from('grocery_items')
    .update({ category: same?.category ?? a.category, ...(same ? { product_id: same.id } : {}) })
    .eq('id', line.id)
    .eq('household_id', householdId)
    .eq('category', 'other')
    .is('product_id', null);
  if (error) log.warn('tidy_line_failed', { line: line.id, err: error.message });
  return !error;
}

/** Marks what the model was asked about, answered or not: never asked again. */
async function markAsked(db: SupabaseClient, table: 'products' | 'grocery_items', householdId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.from(table).update({ tidy_asked_at: new Date().toISOString() }).in('id', ids).eq('household_id', householdId);
  if (error) throw new Error(`tidy ${table} asked: ${error.message}`);
}

/** One more tidy for the household when more is waiting than one run takes (and none is queued yet). */
async function queueAnotherIfMore(db: SupabaseClient, householdId: string, log: Logger): Promise<boolean> {
  const [products, lines, queued] = await Promise.all([
    productsWaiting(db, householdId, 'id', 1),
    linesWaiting(db, householdId, 'id', 1),
    db.from('import_jobs').select('id').eq('household_id', householdId).eq('kind', 'tidy').eq('status', 'queued').limit(1),
  ]);
  for (const r of [products, lines, queued]) if (r.error) throw new Error(`tidy what is left: ${r.error.message}`);
  const more = (products.data ?? []).length > 0 || (lines.data ?? []).length > 0;
  if (!more || (queued.data ?? []).length > 0) return false;
  const { error } = await db.from('import_jobs').insert({ household_id: householdId, kind: 'tidy', input_text: 'everything waiting' });
  if (error) throw new Error(`tidy queue another: ${error.message}`);
  log.info('tidy_queued_another');
  return true;
}

/** Tidies what this household has waiting. Returns how many products and lines changed. */
export async function runTidy(deps: KitchenJobDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<{ products: number; lines: number }> {
  const household = job.household_id;
  const { products, lines } = await waiting(deps.db, household);
  const names = [...new Set([...products.map((p) => p.name_en), ...lines.map((l) => l.label)])];
  if (names.length === 0) return { products: 0, lines: 0 };

  const catalog = await deps.catalog.forHousehold(household);
  const known = knownNames(catalog, names).filter((n) => !names.includes(n));
  const answers = normalizeTidy(
    await deps.ai.askJson(
      { parts: [textPart(names.map((n, i) => `${i + 1}. ${n}`).join('\n'))], systemInstruction: tidySystemPrompt(known), schema: TIDY_SCHEMA },
      'tidy',
      signal,
    ),
  );

  let tidied = 0;
  for (const p of products) {
    const a = answers.get(normalizeText(p.name_en));
    if (a && (await tidyProduct(deps.db, household, p, a, log))) tidied += 1;
  }
  let sorted = 0;
  for (const line of lines) {
    const a = answers.get(normalizeText(line.label));
    if (a && (await tidyLine(deps.db, household, line, a, catalog, log))) sorted += 1;
  }
  await markAsked(deps.db, 'products', household, products.map((p) => p.id));
  await markAsked(deps.db, 'grocery_items', household, lines.map((l) => l.id));
  // Only a full batch can have left something behind (what comes in meanwhile queues its own tidy).
  const another = products.length === BATCH || lines.length === BATCH ? await queueAnotherIfMore(deps.db, household, log) : false;
  log.info('tidy_done', { asked: names.length, products: tidied, of_products: products.length, lines: sorted, of_lines: lines.length, another });
  return { products: tidied, lines: sorted };
}
