// "Ideas for the tomatoes": three dishes that use one food, preferring what is already at home (soonest
// to expire first). Never a recipe: a title, what it uses, what to buy, about how long, and why it fits.
// What a dish "uses" is checked against what is really at home: anything else moves to what to buy.
import { nullable, Type, type ModelSchema } from './model-schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeText, type ImportJob, type UseItUpIdeas } from '@mesa/shared';

import { ImportError, MESSAGES } from './errors';
import type { Logger } from './log';
import { matchIngredient, phraseKey, type Catalog } from './mapping';
import { textPart } from './pipeline-common';
import type { KitchenJobDeps } from './ports';
import { todayLine } from './prompt-dates';
import { pantryRows } from './repos/kitchen';

const IDEAS = 3;
/** Foods listed to the model (soonest to expire first); the rest still count when checking. */
const MAX_LISTED = 60;
const MAX_ITEMS = 10;
const MAX_TITLE = 120;
const MAX_WHY = 160;
const MAX_MINUTES = 24 * 60;


const IDEAS_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    ideas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'The dish, in English, a few words.' },
          uses: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Foods from the "At home" list it uses, exactly as listed.' },
          to_buy: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Foods it needs that are not at home, in English.' },
          minutes: nullable({ type: Type.INTEGER, description: 'About how long it takes, in minutes.' }),
          why: { type: Type.STRING, description: 'One short line on why it fits.' },
        },
        required: ['title', 'uses', 'to_buy', 'minutes', 'why'],
        propertyOrdering: ['title', 'uses', 'to_buy', 'minutes', 'why'],
      },
    },
  },
  required: ['ideas'],
};

/** One food at home (a pantry_status row that is not out or gone). */
export interface HomeFood {
  product_id: string;
  name_en: string;
  expires_on: string | null;
}

/** One line per product (the soonest date of its rows), soonest to expire first, then the rest by name. */
export function homeFoods(rows: readonly HomeFood[]): HomeFood[] {
  const byProduct = new Map<string, HomeFood>();
  for (const r of rows) {
    if (typeof r.name_en !== 'string' || r.name_en.trim() === '') continue;
    const seen = byProduct.get(r.product_id);
    if (!seen || (r.expires_on !== null && (seen.expires_on === null || r.expires_on < seen.expires_on))) byProduct.set(r.product_id, r);
  }
  return [...byProduct.values()].sort((a, b) => {
    if (a.expires_on !== b.expires_on) {
      if (a.expires_on === null) return 1;
      if (b.expires_on === null) return -1;
      return a.expires_on < b.expires_on ? -1 : 1;
    }
    return a.name_en.localeCompare(b.name_en);
  });
}

/** The household's name for a food when it is at home, else null. */
export type AtHome = (name: string) => string | null;

const keyOf = (s: string): string => phraseKey(s) || normalizeText(s);

/**
 * Same name (singular/plural, case and accents ignored), or, through the catalog, the same product
 * ("cherry tomatoes" is the Tomato at home; "tomato paste" is not).
 */
export function homeMatcher(home: readonly Pick<HomeFood, 'product_id' | 'name_en'>[], catalog: Catalog | null): AtHome {
  const byKey = new Map<string, string>();
  const byProduct = new Map<string, string>();
  for (const h of home) {
    const key = keyOf(h.name_en);
    if (key !== '' && !byKey.has(key)) byKey.set(key, h.name_en);
    if (!byProduct.has(h.product_id)) byProduct.set(h.product_id, h.name_en);
  }
  return (name) => {
    const key = keyOf(name);
    if (key === '') return null;
    const same = byKey.get(key);
    if (same) return same;
    const product = catalog ? matchIngredient(catalog, name, '') : null;
    return product ? (byProduct.get(product.id) ?? null) : null;
  };
}

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => clean(x, 80)).filter((x) => x.length > 0) : []);

/**
 * The model's answer as stored: at most three ideas with a title, each using the food first, every
 * "use" really at home (in the household's words) and everything else to buy, without duplicates.
 */
export function checkIdeas(raw: unknown, food: string, atHome: AtHome): UseItUpIdeas {
  const list = (raw as { ideas?: unknown } | null)?.ideas;
  const foodKey = keyOf(food);
  const ideas: UseItUpIdeas['ideas'] = [];
  const titles = new Set<string>();
  for (const it of Array.isArray(list) ? (list as Record<string, unknown>[]) : []) {
    if (ideas.length === IDEAS) break;
    const title = clean(it?.title, MAX_TITLE);
    if (title === '' || titles.has(normalizeText(title))) continue;
    titles.add(normalizeText(title));

    const uses = new Map<string, string>([[foodKey, food]]);
    const toBuy = new Map<string, string>();
    for (const name of [...strings(it.uses), ...strings(it.to_buy)]) {
      const home = keyOf(name) === foodKey ? food : atHome(name);
      if (home !== null) {
        if (!uses.has(keyOf(home))) uses.set(keyOf(home), home);
      } else if (!toBuy.has(keyOf(name))) {
        toBuy.set(keyOf(name), name);
      }
    }
    const minutes = typeof it.minutes === 'number' && Number.isFinite(it.minutes) && it.minutes > 0
      ? Math.min(Math.round(it.minutes), MAX_MINUTES)
      : null;
    ideas.push({
      title,
      uses: [...uses.values()].slice(0, MAX_ITEMS),
      to_buy: [...toBuy.values()].slice(0, MAX_ITEMS),
      minutes,
      why: clean(it.why, MAX_WHY),
    });
  }
  return { food, ideas };
}

export function ideasSystemPrompt(): string {
  return `You suggest dishes for a household kitchen app used anywhere in the world. Someone has a food they want to use up and asks what they could cook with it.
Return ${IDEAS} different, everyday dish ideas that use that food. Don't assume a country or a cuisine: what is at home is the best hint of what this household cooks.
- Prefer foods from the "At home" list, above all those listed first (they expire soonest).
- uses: the foods from the "At home" list the dish uses, written exactly as listed, the food asked about first.
- to_buy: anything else it needs, in English, lowercase, singular. Fewer is better. Leave out salt, pepper, water and cooking oil.
- title: the dish in English, a few words. minutes: about how long it takes, or null. why: one short line on why it fits (e.g. "Uses the spinach before Friday").
- Never write a recipe: no amounts, no steps.`;
}

export function ideasUserPrompt(food: string, home: readonly HomeFood[], today: Date): string {
  const lines = home.slice(0, MAX_LISTED).map((h) => `- ${h.name_en}${h.expires_on ? ` (use by ${h.expires_on})` : ''}`);
  return `${todayLine(today)}
Food to use: ${food}
At home (soonest to expire first):
${lines.length > 0 ? lines.join('\n') : '- nothing else listed'}`;
}

const loadHome = async (db: SupabaseClient, householdId: string): Promise<HomeFood[]> =>
  homeFoods(await pantryRows(db, householdId, { without: ['out', 'gone'] }));

/** The food's name as the household writes it: the job's text, else its product's name. */
async function foodName(db: SupabaseClient, job: ImportJob): Promise<string> {
  const given = job.input_text?.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (given) return given;
  if (job.subject_id) {
    // The shared catalog's product or one of the household's own, never another household's.
    const { data, error } = await db
      .from('products')
      .select('name_en')
      .eq('id', job.subject_id)
      .or(`household_id.is.null,household_id.eq.${job.household_id}`)
      .maybeSingle();
    if (error) throw new Error(`ideas product: ${error.message}`);
    const name = (data as { name_en?: string } | null)?.name_en?.trim();
    if (name) return name;
  }
  throw new ImportError('ideasFailed', { detail: 'no food to find ideas for' });
}

/** Asks for ideas and checks them against what is at home. */
export async function runIdeas(deps: KitchenJobDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<UseItUpIdeas> {
  const food = await foodName(deps.db, job);
  const home = await loadHome(deps.db, job.household_id);
  const foodKey = keyOf(food);
  const others = home.filter((h) => h.product_id !== job.subject_id && keyOf(h.name_en) !== foodKey);
  const raw = await deps.ai.askJson(
    { parts: [textPart(ideasUserPrompt(food, others, new Date()))], systemInstruction: ideasSystemPrompt(), schema: IDEAS_SCHEMA },
    'ideas',
    signal,
  );
  // The food asked about counts as at home, under the household's name for it.
  const subject = job.subject_id ? [{ product_id: job.subject_id, name_en: food }] : [];
  const atHome = homeMatcher([...subject, ...home], await deps.catalog.forHousehold(job.household_id));
  const result = checkIdeas(raw, food, atHome);
  if (result.ideas.length === 0) throw new ImportError('ideasFailed', { detail: 'no usable idea in the answer' });
  log.info('ideas_done', {
    at_home: home.length,
    ideas: result.ideas.length,
    uses: result.ideas.reduce((n, i) => n + i.uses.length, 0),
    to_buy: result.ideas.reduce((n, i) => n + i.to_buy.length, 0),
  });
  return result;
}
