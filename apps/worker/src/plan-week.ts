// Plan my week: 4–5 dinners chosen among the household's own saved recipes, never a new one. A
// deterministic score shortlists what suits this week (foods that go soon, mostly at home, favorites,
// not cooked in the last days, varied titles); one model call picks the dinners and says why. Every pick
// is checked: a shortlisted recipe of the household, once, and what it "uses" really at home and in the
// recipe. Nothing is planned here: the person unticks what doesn't suit them and plans from the app.
import { enumOf, nullable, Type, type ModelSchema } from './model-schema';
import { normalizeText, type ImportJob, type WeekPlan } from '@mesa/shared';

import { ImportError, MESSAGES } from './errors';
import {
  bySoonest,
  coverage,
  loadMenu,
  loadPantry,
  loadRecipes,
  type Coverage,
  type KitchenRecipe,
  type Pantry,
  type PantryFood,
} from './kitchen-context';
import { cleanList, cleanOrNull, cleanText, daysSince, keyWords, recipeRefs, todayLine, type RecipeRefs } from './kitchen-text';
import type { Logger } from './log';
import { matchIngredient, phraseKey, type Catalog } from './mapping';
import { textPart } from './pipeline-common';
import type { KitchenJobDeps } from './ports';

const SHORTLIST = 25;
const MAX_DINNERS = 7;
/** Cooked this recently: rather not again this week. */
const RECENT_DAYS = 7;
const MAX_LISTED_FOODS = 60;
const MAX_LISTED_INGREDIENTS = 10;
const MAX_USES = 4;
const MAX_WHY = 160;
const MAX_NOTE = 200;
const MAX_WISHES = 200;

/** What the shortlist score weighs. */
export const PLAN_WEIGHTS = {
  /** Per food that goes soon (at most `soonCap` count). */
  soon: 3,
  soonCap: 3,
  /** Times the share of needed ingredients at home (0–1). */
  atHome: 4,
  favorite: 2,
  /** Cooked in the last RECENT_DAYS days. */
  recent: -6,
  /** Per word of the wishes found in the title or ingredients (at most `wishCap`). */
  wish: 2,
  wishCap: 3,
  /** Per recipe already shortlisted that shares a title word. */
  variety: 1.5,
} as const;

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;


const PLAN_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    dinners: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          recipe: { type: Type.STRING, description: 'The ref of a listed recipe, e.g. "R3".' },
          day: nullable(enumOf(WEEKDAYS)),
          why: { type: Type.STRING, description: 'One short, honest line on why it fits this week.' },
          uses_soon: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Foods from the "At home" list it uses, exactly as listed.' },
        },
        required: ['recipe', 'day', 'why', 'uses_soon'],
        propertyOrdering: ['recipe', 'day', 'why', 'uses_soon'],
      },
    },
    note: nullable({ type: Type.STRING, description: 'One line about the whole week.' }),
  },
  required: ['dinners', 'note'],
  propertyOrdering: ['dinners', 'note'],
};

/** The wishes of the job, or null when it just says 'week' (or nothing). */
export function planWishes(input: string | null | undefined): string | null {
  const text = cleanText(input, MAX_WISHES);
  return text === '' || normalizeText(text) === 'week' ? null : text;
}

export interface PlanCandidate {
  recipe: KitchenRecipe;
  cover: Coverage;
  score: number;
  /** Key words of the title, for variety. */
  words: ReadonlySet<string>;
}

const recipeWords = (r: KitchenRecipe): Set<string> => keyWords([r.title, ...r.ingredients.map((i) => i.name)].join(' '));

/** How well a recipe suits this week, before variety. */
export function scoreRecipe(recipe: KitchenRecipe, cover: Coverage, today: Date, wishWords: ReadonlySet<string>): number {
  const w = PLAN_WEIGHTS;
  let score = Math.min(cover.soon.length, w.soonCap) * w.soon;
  if (cover.total > 0) score += w.atHome * (cover.have / cover.total);
  if (recipe.is_favorite) score += w.favorite;
  const days = daysSince(recipe.last_cooked_at, today);
  if (days !== null && days < RECENT_DAYS) score += w.recent;
  if (wishWords.size > 0) {
    const words = recipeWords(recipe);
    const hits = [...wishWords].filter((x) => words.has(x)).length;
    score += Math.min(hits, w.wishCap) * w.wish;
  }
  return Math.round(score * 1000) / 1000;
}

/** Higher score first; then the one cooked longest ago (never first), then by title. */
function byScore(a: PlanCandidate, b: PlanCandidate): number {
  if (a.score !== b.score) return b.score - a.score;
  const ca = a.recipe.last_cooked_at ?? '';
  const cb = b.recipe.last_cooked_at ?? '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.recipe.title.localeCompare(b.recipe.title);
}

const shares = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => [...a].some((w) => b.has(w));

/**
 * The recipes the model chooses from: best score first, each pick lowering the recipes whose title shares
 * a word with it (not five chicken dishes). Recipes in `skip` (already on the menu) are left out.
 */
export function shortlist(
  recipes: readonly KitchenRecipe[],
  pantry: Pantry,
  opts: { today: Date; wishes: string | null; skip?: ReadonlySet<string>; size?: number },
): PlanCandidate[] {
  const wishWords = opts.wishes ? keyWords(opts.wishes) : new Set<string>();
  const pool = recipes
    .filter((r) => !opts.skip?.has(r.id))
    .map((recipe) => {
      const cover = coverage(recipe, pantry);
      return { recipe, cover, score: scoreRecipe(recipe, cover, opts.today, wishWords), words: keyWords(recipe.title) };
    })
    .sort(byScore);
  const picked: PlanCandidate[] = [];
  while (picked.length < (opts.size ?? SHORTLIST) && pool.length > 0) {
    let best = 0;
    let bestValue = -Infinity;
    pool.forEach((c, i) => {
      const value = c.score - PLAN_WEIGHTS.variety * picked.filter((p) => shares(p.words, c.words)).length;
      if (value > bestValue) {
        best = i;
        bestValue = value;
      }
    });
    picked.push(pool.splice(best, 1)[0]!);
  }
  return picked;
}

export function planSystemPrompt(): string {
  return `You plan dinners for a household kitchen app used anywhere in the world. Pick the week's dinners ONLY from the recipes listed: they are the household's own saved recipes. Never invent, rename or describe a dish that is not listed.
- Pick 4 or 5 different dinners (fewer only when fewer recipes are listed; more only when the wishes ask for it), each recipe once.
- Follow the wishes first. Then prefer recipes that use foods going soon (listed first under "At home"), recipes mostly at home, and favorites; vary the dishes; avoid what was cooked in the last days.
- day: a weekday from today on, the dinners using the soonest foods first, quick ones on busy weekdays; null when the order doesn't matter.
- why: one short, honest line on why this dinner this week (e.g. "Uses the spinach before Friday", "A favorite, 20 min"). Never claim something the list doesn't say.
- uses_soon: foods from the "At home" list this recipe uses, written exactly as listed; empty when none.
- note: one line about the whole week, or null.
- Write why and note in the language of the wishes when the person wrote them in their own words; otherwise in the language most recipe titles are written in.`;
}

function foodLine(f: PantryFood): string {
  const parts = [f.amount, f.expires_on ? `use by ${f.expires_on}` : null].filter(Boolean);
  return `- ${f.name}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
}

function candidateLine(c: PlanCandidate, refs: RecipeRefs, today: Date): string {
  const r = c.recipe;
  const days = daysSince(r.last_cooked_at, today);
  const ingredients = r.ingredients.filter((i) => !i.is_optional).map((i) => i.name).slice(0, MAX_LISTED_INGREDIENTS);
  return [
    refs.ref(r.id),
    r.title,
    r.total_minutes ? `${r.total_minutes} min` : 'time unknown',
    r.is_favorite ? 'favorite' : null,
    days === null ? 'never cooked' : days === 0 ? 'cooked today' : `cooked ${days} days ago`,
    c.cover.total > 0 ? `at home ${c.cover.have}/${c.cover.total}` : null,
    c.cover.soon.length > 0 ? `goes soon: ${c.cover.soon.map((f) => f.name).join(', ')}` : null,
    ingredients.length > 0 ? `ingredients: ${ingredients.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

export function planUserPrompt(input: {
  today: Date;
  wishes: string | null;
  candidates: readonly PlanCandidate[];
  refs: RecipeRefs;
  pantry: Pantry;
  menu: readonly string[];
}): string {
  const foods = input.pantry.foods.slice(0, MAX_LISTED_FOODS).map(foodLine);
  return `${todayLine(input.today)}
Wishes: ${input.wishes ?? 'none, just plan the week'}
Already on the menu: ${input.menu.length > 0 ? input.menu.join('; ') : 'nothing'}
At home (soonest to use first):
${foods.length > 0 ? foods.join('\n') : '- nothing listed'}
Recipes (ref | title | time | …):
${input.candidates.map((c) => candidateLine(c, input.refs, input.today)).join('\n')}`;
}

/**
 * What the dinner uses at home: the foods going soon it really uses, plus those the model named that are
 * at home and in the recipe (by name, or the same product through the catalog). Soonest first.
 */
function usesAtHome(named: readonly string[], cover: Coverage, catalog: Catalog | null): string[] {
  const keep = new Map(cover.soon.map((f) => [f.product_id, f]));
  for (const name of named) {
    const key = phraseKey(name);
    const product = catalog ? matchIngredient(catalog, name, '')?.id : undefined;
    const hit = cover.uses.find((f) => phraseKey(f.name) === key || f.product_id === product);
    if (hit) keep.set(hit.product_id, hit);
  }
  return [...keep.values()].sort(bySoonest).slice(0, MAX_USES).map((f) => f.name);
}

/** Said only when the model gave no reason: what the list shows. */
function plainWhy(c: PlanCandidate): string {
  if (c.cover.soon.length > 0) return `Uses ${c.cover.soon.map((f) => f.name).slice(0, 2).join(' and ')} soon`;
  if (c.recipe.is_favorite) return 'A favorite';
  return c.cover.total > 0 ? `${c.cover.have} of ${c.cover.total} ingredients at home` : 'From your recipes';
}

function weekday(v: unknown): string | null {
  const text = cleanText(v, 20).toLowerCase();
  if (text.length < 3) return null;
  return WEEKDAYS.find((d) => d.toLowerCase() === text || d.toLowerCase().slice(0, 3) === text) ?? null;
}

/**
 * The model's answer as stored: dinners naming a shortlisted recipe, each once (unknown refs left out),
 * title from the recipe itself, one dinner per day, uses_soon checked against what is at home.
 */
export function checkPlan(
  raw: unknown,
  ctx: { wishes: string | null; refs: RecipeRefs; candidates: readonly PlanCandidate[]; catalog: Catalog | null },
): WeekPlan {
  const answer = (raw ?? {}) as { dinners?: unknown; note?: unknown };
  const byId = new Map(ctx.candidates.map((c) => [c.recipe.id, c]));
  const days = new Set<string>();
  const dinners: WeekPlan['dinners'] = [];
  for (const d of Array.isArray(answer.dinners) ? (answer.dinners as Record<string, unknown>[]) : []) {
    if (dinners.length === MAX_DINNERS) break;
    const id = ctx.refs.resolve(d?.recipe);
    const c = id ? byId.get(id) : undefined;
    if (!c || dinners.some((x) => x.recipe_id === c.recipe.id)) continue;
    let day = weekday(d.day);
    if (day && days.has(day)) day = null;
    if (day) days.add(day);
    dinners.push({
      recipe_id: c.recipe.id,
      title: c.recipe.title,
      day,
      why: cleanText(d.why, MAX_WHY) || plainWhy(c),
      uses_soon: usesAtHome(cleanList(d.uses_soon, 80), c.cover, ctx.catalog),
    });
  }
  return { wishes: ctx.wishes, dinners, note: cleanOrNull(answer.note, MAX_NOTE) };
}

/** Shortlists the household's recipes, asks for the week's dinners and checks them. */
export async function runPlan(deps: KitchenJobDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<WeekPlan> {
  const wishes = planWishes(job.input_text);
  const catalog = (await deps.catalog.forHousehold(job.household_id)) ?? null;
  const [pantry, recipes, menu] = await Promise.all([
    loadPantry(deps.db, catalog, job.household_id),
    loadRecipes(deps.db, job.household_id),
    loadMenu(deps.db, job.household_id),
  ]);
  if (recipes.length === 0) throw new ImportError('planNoRecipes', { detail: 'no saved recipe' });

  const today = new Date();
  const onMenu = new Set(menu.map((m) => m.recipe_id));
  // Everything already on the menu: plan among all of them rather than nothing.
  const fresh = shortlist(recipes, pantry, { today, wishes, skip: onMenu });
  const candidates = fresh.length > 0 ? fresh : shortlist(recipes, pantry, { today, wishes });
  const refs = recipeRefs(candidates.map((c) => c.recipe.id));
  const titles = new Map(recipes.map((r) => [r.id, r.title]));
  const menuTitles = menu.map((m) => titles.get(m.recipe_id)).filter((t): t is string => !!t);

  const raw = await deps.ai.askJson(
    {
      parts: [textPart(planUserPrompt({ today, wishes, candidates, refs, pantry, menu: menuTitles }))],
      systemInstruction: planSystemPrompt(),
      schema: PLAN_SCHEMA,
    },
    'plan_week',
    signal,
  );
  const plan = checkPlan(raw, { wishes, refs, candidates, catalog });
  if (plan.dinners.length === 0) throw new ImportError('planFailed', { detail: 'no usable dinner in the answer' });
  log.info('plan_done', {
    recipes: recipes.length,
    shortlisted: candidates.length,
    on_menu: menu.length,
    at_home: pantry.foods.length,
    dinners: plan.dinners.length,
    with_day: plan.dinners.filter((d) => d.day !== null).length,
    wishes: wishes !== null,
  });
  return plan;
}
