// "Ask about this recipe": the recipe the question is about, written first in the prompt in full (title,
// servings, every ingredient line with what is at home, every step). When the question asks for a number
// of servings ("for 2", "¿para 6?"), the amounts for it are computed here with scaleQuantity and given to
// the model to copy: a model never scales. Pure.
import { formatQuantity, normalizeText } from '@mesa/shared';

import type { FullIngredient, FullRecipe, Pantry } from './kitchen-context';
import { cleanText, scaledAmount, type ServingsAsked } from './kitchen-text';

const MAX_LINE = 200;
const MAX_STEP = 600;
const MAX_STEPS = 40;
const MAX_INGREDIENTS = 60;

/** The servings to show amounts for: those asked when they differ from the recipe's, else null. */
export function servingsFor(recipe: Pick<FullRecipe, 'servings'>, asked: ServingsAsked | null): ServingsAsked | null {
  return asked && recipe.servings >= 1 && asked.servings !== recipe.servings ? asked : null;
}

/** "200 ml panna (Cream)": the line as written, with the food's name when the line doesn't say it. */
function lineText(i: FullIngredient): string {
  const raw = cleanText(i.raw_text, MAX_LINE);
  const name = cleanText(i.name, 80);
  if (raw === '') return name;
  return name !== '' && !normalizeText(raw).includes(normalizeText(name)) ? `${raw} (${name})` : raw;
}

function ingredientLine(i: FullIngredient, n: number, recipe: FullRecipe, pantry: Pantry, scale: ServingsAsked | null): string {
  const parts = [`${n}. ${lineText(i)}`];
  if (scale) {
    const amount = scaledAmount(i, recipe.servings, scale.servings);
    parts.push(`→ for ${scale.servings}: ${formatQuantity(amount.quantity, amount.unit) || 'as written'}`);
  }
  if (i.is_optional) parts.push('(optional)');
  parts.push(pantry.has(i.product_id) ? '· at home' : '· not at home');
  return parts.join(' ');
}

/** The recipe block: the first thing in the prompt when the question is about a saved recipe. */
export function recipeBlock(recipe: FullRecipe, ref: string, pantry: Pantry, asked: ServingsAsked | null): string {
  const scale = servingsFor(recipe, asked);
  const head = [`${ref} | ${recipe.title}`, `serves ${recipe.servings}`, recipe.total_minutes ? `${recipe.total_minutes} min` : null]
    .filter(Boolean)
    .join(' | ');
  const scaleLine = scale
    ? `\nAsked for ${scale.servings} servings (the recipe serves ${recipe.servings}): the amounts "for ${scale.servings}" below are computed; give them exactly as written, never compute your own.${
        scale.only ? ` The question only asks for these amounts.` : ''
      }`
    : '';
  const ingredients = recipe.ingredients.slice(0, MAX_INGREDIENTS).map((i, n) => ingredientLine(i, n + 1, recipe, pantry, scale));
  const steps = recipe.steps
    .map((s) => cleanText(s, MAX_STEP))
    .filter((s) => s !== '')
    .slice(0, MAX_STEPS)
    .map((s, n) => `${n + 1}. ${s}`);
  return `The question is about this saved recipe:
${head}${scaleLine}
Ingredients:
${ingredients.join('\n') || 'none listed'}
Steps:
${steps.join('\n') || 'none listed'}`;
}
