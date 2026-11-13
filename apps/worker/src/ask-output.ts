// Ask Mesa, the checks: the model's answer turned into the AskAnswer the app shows. A short answer (80
// words at most), saved recipes that were listed (each once, with its own title), and well-formed actions
// only: list items in the app's unit codes, recipes that exist, one find (the app runs it at once) and one
// plan_week (the app opens Plan my week with the wishes).
import type { AskAnswer } from '@mesa/shared';

import { cleanQuery } from './discover-queries';
import { ImportError, MESSAGES } from './errors';
import { cleanOrNull, cleanText, limitWords, toAmount, type RecipeRefs } from './kitchen-text';

export const MAX_WORDS = 80;
export const MAX_ANSWER = 700;
// The app shows at most 4 recipes, 3 actions and 30 items.
export const MAX_RECIPES = 4;
export const MAX_ACTIONS = 3;
const MAX_ITEMS = 30;
const MAX_LABEL = 40;
const MAX_WHY = 140;
const MAX_WISHES = 120;

export const ACTION_KINDS = ['add_to_list', 'plan', 'open_recipe', 'find', 'plan_week'] as const;
type ActionKind = (typeof ACTION_KINDS)[number];
type Action = AskAnswer['actions'][number];
/** Button text when the model gave none. */
const DEFAULT_LABEL: Record<ActionKind, string> = {
  add_to_list: 'Add to list',
  plan: 'Plan it',
  open_recipe: 'Open recipe',
  find: 'Find recipes',
  plan_week: 'Plan my week',
};

export interface AnswerContext {
  refs: RecipeRefs;
  /** The listed recipes' titles, by id. */
  titles: ReadonlyMap<string, string>;
  onMenu: ReadonlySet<string>;
  /** The recipe the question is about (the person is on it): never pointed to or opened again. */
  about: string | null;
}

function actionOf(a: Record<string, unknown>, ctx: AnswerContext): Action | null {
  const kind = ACTION_KINDS.find((k) => k === a?.kind);
  if (!kind) return null;
  const label = cleanText(a.label, MAX_LABEL) || DEFAULT_LABEL[kind];
  if (kind === 'add_to_list') {
    const items = (Array.isArray(a.items) ? (a.items as Record<string, unknown>[]) : [])
      .map((i) => ({ label: cleanText(i?.label, 80), ...toAmount(i?.quantity, i?.unit) }))
      .filter((i) => i.label !== '')
      .slice(0, MAX_ITEMS);
    return items.length > 0 ? { kind, label, items } : null;
  }
  if (kind === 'find') {
    const query = cleanQuery(a.query);
    return query ? { kind, label, query } : null;
  }
  if (kind === 'plan_week') return { kind, label, wishes: cleanOrNull(a.wishes, MAX_WISHES) };
  const id = ctx.refs.resolve(a.recipe);
  if (!id || !ctx.titles.has(id)) return null;
  // Already on the menu: planning it again would add it twice. Already open: nothing to open.
  if (kind === 'plan' && ctx.onMenu.has(id)) return null;
  if (kind === 'open_recipe' && id === ctx.about) return null;
  return { kind, label, recipe_id: id };
}

/** One list, one search, one week plan; plan / open once per recipe. */
const actionKey = (a: Action): string =>
  a.kind === 'add_to_list' || a.kind === 'find' || a.kind === 'plan_week' ? a.kind : `${a.kind}:${a.recipe_id}`;

/**
 * The answer while it is written, shaped like the stored one so it doesn't jump at the end: spaces
 * collapsed, at most 80 words and 700 characters (without the final "…", which checkAnswer decides).
 */
export function draftAnswer(partial: string): string {
  const text = partial.replace(/\s+/g, ' ').trimStart();
  const words = text.split(' ');
  const cut = (words.length > MAX_WORDS ? words.slice(0, MAX_WORDS).join(' ') : text).slice(0, MAX_ANSWER);
  // Half an emoji is not text the database takes.
  return cut.replace(/[\uD800-\uDBFF]$/, '');
}

/**
 * The model's answer as stored: a short answer (80 words at most), recipes that are listed ones (unknown
 * refs and the recipe asked about left out, each once, the title from the recipe), well-formed actions
 * only. Off topic: the answer alone. Throws askFailed when there is no answer.
 */
export function checkAnswer(raw: unknown, ctx: AnswerContext): AskAnswer {
  const r = (raw ?? {}) as { on_topic?: unknown; answer?: unknown; recipes?: unknown; actions?: unknown };
  const answer = limitWords(cleanText(r.answer, MAX_ANSWER * 2), MAX_WORDS).slice(0, MAX_ANSWER);
  if (answer === '') throw new ImportError('askFailed', { detail: 'no answer' });
  if (r.on_topic === false) return { answer, recipes: [], actions: [] };

  const recipes: AskAnswer['recipes'] = [];
  for (const x of Array.isArray(r.recipes) ? (r.recipes as Record<string, unknown>[]) : []) {
    if (recipes.length === MAX_RECIPES) break;
    const id = ctx.refs.resolve(x?.recipe);
    const title = id ? ctx.titles.get(id) : undefined;
    if (!id || !title || id === ctx.about || recipes.some((y) => y.recipe_id === id)) continue;
    recipes.push({ recipe_id: id, title, why: cleanText(x.why, MAX_WHY) });
  }
  const actions: Action[] = [];
  for (const a of Array.isArray(r.actions) ? (r.actions as Record<string, unknown>[]) : []) {
    if (actions.length === MAX_ACTIONS) break;
    const action = actionOf(a, ctx);
    if (action && !actions.some((b) => actionKey(b) === actionKey(action))) actions.push(action);
  }
  return { answer, recipes, actions };
}
