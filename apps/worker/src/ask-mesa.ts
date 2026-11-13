// Ask Mesa, the one assistant: a question in plain words ("what can I make in 20 min without going out?",
// "do we have rice?", "plan our week", "something new with chickpeas"), or about one saved recipe ("no
// cream?", "for 2", "can I make it ahead?"), answered from this household's kitchen in one model call: a
// short answer in the language of the question, the saved recipes it points to, and actions (add to the
// list, plan or open a recipe, plan the week, find new recipe videos: the app runs that search at once).
// Never a recipe of its own. Nothing is changed here: actions are proposals. The answer shows as it is
// written: the call is streamed with little thinking, and its words so far go to import_jobs.draft.
import { enumOf, nullable, Type, type ModelSchema } from './model-schema';
import type { AskAnswer, ImportJob } from '@mesa/shared';

import { ACTION_KINDS, checkAnswer, draftAnswer, MAX_ACTIONS, MAX_ANSWER, MAX_RECIPES, MAX_WORDS } from './ask-output';
import { recipeBlock } from './ask-recipe';
import { jobDraft, type Draft } from './draft';
import { ImportError, MESSAGES } from './errors';
import {
  coverage,
  loadFullRecipe,
  loadMenu,
  loadPantry,
  loadRecipes,
  loadToBuy,
  type Coverage,
  type FullRecipe,
  type KitchenRecipe,
  type MenuEntry,
  type Pantry,
} from './kitchen-context';
import { cleanText, keyWords, recipeRefs, servingsAsked, todayLine, UNIT_CODES, type RecipeRefs } from './kitchen-text';
import type { Logger } from './log';
import { partialStringField } from './partial-json';
import { textPart } from './pipeline-common';
import type { KitchenJobDeps } from './ports';

const MAX_LISTED_RECIPES = 150;
const MAX_LISTED_FOODS = 120;
const MAX_LISTED_INGREDIENTS = 8;
const MAX_TURNS = 6;
const MAX_QUESTION = 500;


// `answer` right after on_topic: it is written first, so it can be shown while the rest comes.
const ASK_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    on_topic: { type: Type.BOOLEAN, description: 'False when the question is not about food, cooking, meals, groceries or this kitchen.' },
    answer: { type: Type.STRING },
    recipes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { recipe: { type: Type.STRING, description: 'A listed ref, e.g. "R3".' }, why: { type: Type.STRING } },
        required: ['recipe', 'why'],
        propertyOrdering: ['recipe', 'why'],
      },
    },
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: enumOf(ACTION_KINDS),
          label: { type: Type.STRING, description: 'Short button text, in the language of the question.' },
          recipe: nullable({ type: Type.STRING, description: 'plan / open_recipe: a listed ref.' }),
          query: nullable({ type: Type.STRING, description: 'find: the dish to search, 2 to 6 words.' }),
          wishes: nullable({ type: Type.STRING, description: 'plan_week: their wishes for the week in a few words; null for none.' }),
          items: {
            type: Type.ARRAY,
            description: 'add_to_list: what to put on the shopping list.',
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                quantity: nullable({ type: Type.NUMBER }),
                unit: nullable({ type: Type.STRING, description: `One of ${UNIT_CODES.join(', ')}; null for none.` }),
              },
              required: ['label', 'quantity', 'unit'],
              propertyOrdering: ['label', 'quantity', 'unit'],
            },
          },
        },
        required: ['kind', 'label', 'recipe', 'query', 'wishes', 'items'],
        propertyOrdering: ['kind', 'label', 'recipe', 'query', 'wishes', 'items'],
      },
    },
  },
  required: ['on_topic', 'answer', 'recipes', 'actions'],
  propertyOrdering: ['on_topic', 'answer', 'recipes', 'actions'],
};

export interface Turn {
  q: string;
  a: string;
}

/** Earlier turns of the conversation (input_context), cleaned: the last six, newest last. */
export function earlierTurns(context: unknown): Turn[] {
  return (Array.isArray(context) ? (context as Record<string, unknown>[]) : [])
    .map((t) => ({ q: cleanText(t?.q, MAX_QUESTION), a: cleanText(t?.a, MAX_ANSWER) }))
    .filter((t) => t.q !== '' && t.a !== '')
    .slice(-MAX_TURNS);
}

interface Ranked {
  recipe: KitchenRecipe;
  cover: Coverage;
}

/**
 * The recipes listed to the model: those whose title or ingredients share words with the question (and
 * the earlier turns) first, then the best fits for now (at home, going soon, favorites).
 */
export function rankRecipes(recipes: readonly KitchenRecipe[], pantry: Pantry, text: string, max = MAX_LISTED_RECIPES): Ranked[] {
  const asked = keyWords(text);
  return recipes
    .map((recipe) => {
      const cover = coverage(recipe, pantry);
      const title = keyWords(recipe.title);
      const ingredients = keyWords(recipe.ingredients.map((i) => i.name).join(' '));
      const hits = [...asked].reduce((n, w) => n + (title.has(w) ? 3 : ingredients.has(w) ? 1 : 0), 0);
      const fit = (cover.total > 0 ? 2 * (cover.have / cover.total) : 0) + Math.min(cover.soon.length, 3) + (recipe.is_favorite ? 1 : 0);
      return { recipe, cover, score: hits * 10 + fit };
    })
    .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title))
    .slice(0, max)
    .map(({ recipe, cover }) => ({ recipe, cover }));
}

const RECIPE_RULES = `
- The question is about the recipe shown first: answer about it (it may follow earlier turns about it).
- A missing or unwanted ingredient ("no cream?"): say what to use instead and how much, from the food at home or the staples first, else a common one, and any change to the steps in a few words.
- Servings ("for 2"): when amounts "for N" are given they are computed: copy them exactly, never compute your own; keep to the main ones if they don't all fit.
- Timing, technique, doing it ahead, storing: from its steps and plain cooking knowledge; say so when the recipe doesn't say.
- What it needs and is not at home: offer add_to_list (at the amounts for the servings asked).`;

export function askSystemPrompt(aboutRecipe = false): string {
  return `You are Mesa, the one assistant of a household kitchen app used anywhere in the world: people ask you anything about their meals, cooking, groceries and this kitchen. Answer from this household's kitchen as listed: its saved recipes, the food at home, the staples it always has, the shopping list and what is on the menu.
- Answer in the language of the question, plainly, in ${MAX_WORDS} words at most. Say honestly when the kitchen doesn't have something or when you are not sure; never claim something the lists don't say.
- recipes: only saved recipes from the list, by their ref, with one short line on why each (at most ${MAX_RECIPES}). Never invent a recipe and never write one (no new dish with its amounts or steps).
- actions (at most ${MAX_ACTIONS}, only when they help; label: a short button text in the language of the question):
  - add_to_list: items for the shopping list, each with quantity and unit when known.
  - plan: put a listed recipe on the menu. open_recipe: open a listed recipe.
  - plan_week: when they ask to plan meals, the week, or what to eat in the coming days. wishes: their wishes for it in a few words in their language ("quick on weekdays, no meat"), or null. Never plan in the answer: say in one line that Mesa will plan it from their saved recipes and what is at home.
  - find: when they want something new, or nothing saved fits. query: the dish to search, 2 to 6 words, in the dish's own language when obvious ("pad kra pao", "pasta alla norma", "chilaquiles verdes"), never "recipe" or "video". The app runs this search at once below your answer: say "Here are videos for …" in the language of the question, never "tap to search". One find at most.
- Your answer changes nothing by itself: actions are proposals the person taps (a find runs on its own).${aboutRecipe ? RECIPE_RULES : ''}
- When the question is not about food, cooking, meals, groceries or this kitchen, set on_topic to false and answer in one polite line that you can only help with the kitchen, with no recipes and no actions.`;
}

function recipeLine(r: Ranked, refs: RecipeRefs): string {
  const ingredients = r.recipe.ingredients.filter((i) => !i.is_optional).map((i) => i.name).slice(0, MAX_LISTED_INGREDIENTS);
  return [
    refs.ref(r.recipe.id),
    r.recipe.title,
    r.recipe.total_minutes ? `${r.recipe.total_minutes} min` : '? min',
    r.recipe.is_favorite ? 'favorite' : null,
    r.cover.total > 0 ? `at home ${r.cover.have}/${r.cover.total}` : null,
    ingredients.join(', ') || null,
  ]
    .filter(Boolean)
    .join(' | ');
}

export function askUserPrompt(input: {
  today: Date;
  question: string;
  turns: readonly Turn[];
  /** The recipe block (recipeBlock) when the question is about a saved recipe. */
  about: string | null;
  listed: readonly Ranked[];
  refs: RecipeRefs;
  pantry: Pantry;
  toBuy: readonly string[];
  menu: readonly string[];
}): string {
  const foods = input.pantry.foods.slice(0, MAX_LISTED_FOODS).map((f) => {
    const parts = [f.amount, f.expires_on ? `use by ${f.expires_on}` : null].filter(Boolean);
    return `${f.name}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
  });
  const turns = input.turns.map((t) => `Q: ${t.q}\nA: ${t.a}`).join('\n');
  return `${input.about ? `${input.about}\n\n` : ''}${todayLine(input.today)}
At home (soonest to use first): ${foods.join('; ') || 'nothing listed'}
Always have: ${input.pantry.staples.join(', ') || 'nothing listed'}
Shopping list: ${input.toBuy.join('; ') || 'empty'}
On the menu: ${input.menu.join('; ') || 'nothing'}
${input.about ? 'Other saved recipes' : 'Saved recipes'} (ref | title | time | … | main ingredients):
${input.listed.map((r) => recipeLine(r, input.refs)).join('\n') || 'none yet'}
${turns ? `\nEarlier in this conversation:\n${turns}\n` : ''}
Question: ${input.question}`;
}

/** "Chicken tinga (R3, 4 servings)": the ref only when the recipe is listed. */
const menuLine = (m: MenuEntry, all: ReadonlyMap<string, string>, listed: ReadonlyMap<string, string>, refs: RecipeRefs): string | null => {
  const title = all.get(m.recipe_id);
  if (!title) return null;
  return `${title} (${listed.has(m.recipe_id) ? `${refs.ref(m.recipe_id)}, ` : ''}${m.servings} servings)`;
};

/** The household's recipe the job is about (subject_id), or null: none, or not theirs (then ignored). */
async function recipeAsked(deps: Pick<KitchenJobDeps, 'db'>, job: ImportJob, log: Logger): Promise<FullRecipe | null> {
  if (!job.subject_id) return null;
  const recipe = await loadFullRecipe(deps.db, job.household_id, job.subject_id);
  if (!recipe) log.warn('ask_recipe_ignored', { recipe: job.subject_id });
  return recipe;
}

/** The answer's words so far, read from the JSON the model is still writing, into the job's draft. */
export function answerAsWritten(draft: Draft): (soFar: string) => void {
  return (soFar) => {
    const answer = partialStringField(soFar, 'answer');
    draft.write(answer ? draftAnswer(answer.value) : '');
    if (answer?.done) draft.flush();
  };
}

/** Reads the kitchen (and the recipe asked about), asks the question with the earlier turns, checks the answer. */
export async function runAsk(deps: KitchenJobDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<AskAnswer> {
  const question = cleanText(job.input_text, MAX_QUESTION);
  if (question === '') throw new ImportError('askFailed', { detail: 'no question' });
  const turns = earlierTurns(job.input_context);
  const catalog = (await deps.catalog.forHousehold(job.household_id)) ?? null;
  const [pantry, recipes, toBuy, menu, about] = await Promise.all([
    loadPantry(deps.db, catalog, job.household_id),
    loadRecipes(deps.db, job.household_id),
    loadToBuy(deps.db, job.household_id),
    loadMenu(deps.db, job.household_id),
    recipeAsked(deps, job, log),
  ]);
  const others = about ? recipes.filter((r) => r.id !== about.id) : recipes;
  const listed = rankRecipes(others, pantry, [question, ...turns.map((t) => t.q)].join(' '));
  // The recipe asked about is R1.
  const refs = recipeRefs([...(about ? [about.id] : []), ...listed.map((r) => r.recipe.id)]);
  const titles = new Map([...(about ? [[about.id, about.title] as const] : []), ...listed.map((r) => [r.recipe.id, r.recipe.title] as const)]);
  const allTitles = new Map([...recipes.map((r) => [r.id, r.title] as const), ...(about ? [[about.id, about.title] as const] : [])]);
  const menuLines = menu.map((m) => menuLine(m, allTitles, titles, refs)).filter((l): l is string => l !== null);
  const asked = about ? servingsAsked(question) : null;
  const block = about ? recipeBlock(about, refs.ref(about.id), pantry, asked) : null;

  const draft = jobDraft(deps.db, job.id, log);
  let raw: unknown;
  try {
    raw = await deps.ai.askJson(
      {
        parts: [textPart(askUserPrompt({ today: new Date(), question, turns, about: block, listed, refs, pantry, toBuy, menu: menuLines }))],
        systemInstruction: askSystemPrompt(about !== null),
        schema: ASK_SCHEMA,
        // A conversation: the first words matter more than long thought.
        thinking: 'low',
        onText: answerAsWritten(draft),
      },
      'ask_mesa',
      signal,
    );
  } finally {
    // Before the job is marked done or failed, so no draft lands after it.
    await draft.close();
  }
  const result = checkAnswer(raw, { refs, titles, onMenu: new Set(menu.map((m) => m.recipe_id)), about: about?.id ?? null });
  log.info('ask_done', {
    turns: turns.length,
    about_recipe: about !== null,
    servings_asked: asked?.servings ?? null,
    recipes_listed: listed.length,
    at_home: pantry.foods.length,
    on_topic: (raw as { on_topic?: unknown } | null)?.on_topic !== false,
    recipes: result.recipes.length,
    actions: result.actions.map((a) => a.kind).join(',') || null,
    words: result.answer.split(' ').length,
  });
  return result;
}
