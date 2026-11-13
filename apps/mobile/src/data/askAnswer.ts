// Ask Mesa's answer (AskAnswer in import_jobs.result), read defensively: a model wrote it. Recipes and
// actions that point to a recipe the household doesn't have are left out; its first `find` is the search
// the app runs at once under the answer (askFinds.ts), not a button. Pure.
import { parseUnit, type AskAnswer, type Unit } from '@mesa/shared';

export type AskAction =
  | { key: string; kind: 'add_to_list'; label: string; items: { label: string; quantity: number | null; unit: Unit | null }[] }
  | { key: string; kind: 'plan'; label: string; recipeId: string }
  | { key: string; kind: 'open_recipe'; label: string; recipeId: string }
  /** Plan my week, its wishes filled in ("Quick on weekdays, no fish"); null for any week. */
  | { key: string; kind: 'plan_week'; label: string; wishes: string | null };

/** What a button under an answer does when tapped. */
export type AskActionKind = AskAction['kind'];

export interface AskAnswerView {
  text: string;
  /** Saved recipes it points to: a chip each. */
  recipes: { key: string; recipeId: string; title: string; why: string | null }[];
  actions: AskAction[];
  /** Real recipe videos to look for right away ("spicy chicken, 30 min"); null when it doesn't say. */
  find: { query: string } | null;
}

/** One earlier turn, as the worker reads it (input_context). */
export interface AskContextTurn {
  q: string;
  a: string;
}

const MAX_RECIPES = 4;
const MAX_ACTIONS = 3;
const MAX_ITEMS = 30;
/** Earlier turns sent with a follow-up question. */
export const MAX_CONTEXT_TURNS = 6;
const MAX_CONTEXT_ANSWER = 600;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

type ListItem = Extract<AskAction, { kind: 'add_to_list' }>['items'][number];

/** A line for the list; the unit normalized ("kg" → 1000 g), the amount left out when the unit is unknown. */
function listItem(i: Partial<Record<'label' | 'quantity' | 'unit', unknown>> | null): ListItem | null {
  const label = text(i?.label);
  if (!label) return null;
  const quantity = num(i?.quantity);
  const unitText = text(i?.unit);
  if (!unitText || quantity === null) return { label, quantity, unit: null };
  const unit = parseUnit(unitText);
  return unit ? { label, quantity: quantity * unit.factor, unit: unit.unit } : { label, quantity: null, unit: null };
}

function listItems(value: unknown): ListItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(listItem)
    .filter((i): i is NonNullable<typeof i> => !!i)
    .slice(0, MAX_ITEMS);
}

/** Labels come in the question's language; Plan my week has its own when the model gave none. */
const FALLBACK_LABEL: Partial<Record<string, string>> = { plan_week: 'Plan my week' };

function actionOf(a: Record<string, unknown> | null, index: number, known: (recipeId: string) => boolean): AskAction | null {
  const label = text(a?.label) ?? FALLBACK_LABEL[String(a?.kind)] ?? null;
  if (!a || !label) return null;
  const key = `${index}-${String(a.kind)}`;
  const recipeId = text(a.recipe_id);
  switch (a.kind) {
    case 'add_to_list': {
      const items = listItems(a.items);
      return items.length > 0 ? { key, kind: 'add_to_list', label, items } : null;
    }
    case 'plan':
    case 'open_recipe':
      return recipeId && known(recipeId) ? { key, kind: a.kind, label, recipeId } : null;
    case 'plan_week':
      return { key, kind: 'plan_week', label, wishes: text(a.wishes) };
    default:
      return null;
  }
}

/** The answer, or null when it says nothing. `known`: the recipe is one of the household's. */
export function askAnswerView(result: unknown, known: (recipeId: string) => boolean): AskAnswerView | null {
  const r = result as Partial<Record<keyof AskAnswer, unknown>> | null | undefined;
  const answer = text(r?.answer);
  if (!answer) return null;
  const seen = new Set<string>();
  const recipes = (Array.isArray(r?.recipes) ? r.recipes : [])
    .map((x: Partial<Record<'recipe_id' | 'title' | 'why', unknown>> | null) => {
      const recipeId = text(x?.recipe_id);
      const title = text(x?.title);
      if (!recipeId || !title || !known(recipeId) || seen.has(recipeId)) return null;
      seen.add(recipeId);
      return { key: recipeId, recipeId, title, why: text(x?.why) };
    })
    .filter((x): x is AskAnswerView['recipes'][number] => !!x)
    .slice(0, MAX_RECIPES);
  const raw: (Record<string, unknown> | null)[] = Array.isArray(r?.actions) ? r.actions : [];
  const actions = raw
    .map((a, i) => actionOf(a, i, known))
    .filter((a): a is AskAction => !!a)
    .slice(0, MAX_ACTIONS);
  const query = raw.map((a) => (a?.kind === 'find' ? text(a.query) : null)).find((q) => !!q) ?? null;
  return { text: answer, recipes, actions, find: query ? { query } : null };
}

/** Earlier answered turns for a follow-up question: the last six, newest last, answers kept short. */
export function askContext(turns: { question: string | null; answer: { text: string } | null }[]): AskContextTurn[] {
  return turns
    .flatMap((t) => (t.question && t.answer ? [{ q: t.question, a: t.answer.text.slice(0, MAX_CONTEXT_ANSWER) }] : []))
    .slice(-MAX_CONTEXT_TURNS);
}
