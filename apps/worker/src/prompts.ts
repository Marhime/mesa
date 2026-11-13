// Prompts for Gemini. The recipe stays as the source states it; only name_en is normalized to English.

export const CATEGORY_GUIDE = [
  'produce: fresh fruit, vegetables, fresh herbs, fresh chiles',
  'bakery: bread, bolillos, tortillas, tostadas',
  'meat: meat, poultry, sausages, fish and seafood',
  'dairy: milk, cream, cheese, butter, yogurt, eggs',
  'frozen: frozen foods',
  'cupboard: rice, beans, pasta, flour, sugar, oils, vinegar, spices, dried chiles, canned goods, sauces, broth, nuts',
  'drinks: water, soda, juice, beer, wine',
  'household: non-food items',
  'other: anything else',
].join('; ');

/** How name_en relates to the line and to the known products; said the same way in every prompt that asks for it. */
export const NAME_EN_RULE =
  'Never write a vaguer name than the source: keep the words that make it that product ("fish sauce", never "sauce"; "star anise", never "spice"; "lemongrass", "bò kho seasoning"), and never a placeholder such as "other", "misc" or "ingredient". Copy a known product name listed below only when it is the same product ("soy sauce" for soy sauce, not for fish sauce); otherwise write its own specific name.';

export function recipeSystemPrompt(knownProducts: readonly string[]): string {
  return `You read cooking content that someone shared (a video, social media post, web page, screenshot or pasted text) and return the recipe as JSON for a household grocery app used anywhere in the world.

Rules:
1. Report the recipe exactly as the source states it. Never invent a recipe, never add ingredients or steps the source does not show or say, and never "improve" or complete it from your own knowledge of the dish.
2. If the content is not a recipe (nothing is being cooked or prepared from ingredients), return {"not_a_recipe": true} with an empty title, empty ingredients and empty steps.
3. Use everything available: text written on screen (overlays, captions, subtitles, lists shown in the video), the voice-over, what is visibly added, the post caption or description, and text inside images. In short videos the ingredients are often only written on screen: read every frame with text carefully.
4. ingredients: one entry per ingredient, in the order of the source.
   - raw_text: the ingredient as the source writes or says it, in the source language, including its amount (e.g. "2 jitomates picados", "1 cdita de sal"). If the source has no written line for it, write a short line in the source language.
   - name_en: the canonical English grocery product, singular and lowercase, without amounts, sizes or preparation (e.g. "tomato", "chicken breast", "corn tortilla", "onion", "chipotle in adobo"). ${NAME_EN_RULE}
   - quantity: a number (fractions as decimals: "1/2" → 0.5, "1 ½" → 1.5; for a range like "2-3" use the larger), or null when no amount is given.
   - unit: the unit as the source writes it ("taza", "cda", "cdita", "g", "kg", "ml", "lata", "diente", "pizca", "cup", "tbsp"), or null for a plain count ("3 huevos") or when there is no amount.
   - is_guessed: false when the source states the amount. Only when the source gives no amount and the dish clearly needs a definite one, you may estimate a typical amount and set is_guessed to true. Do not estimate amounts for "to taste" items (salt, pepper, oil for frying, garnish): leave quantity null.
   - is_optional: true only when the source says it is optional or just for garnish or serving.
   - category: one of produce, bakery, meat, dairy, frozen, cupboard, drinks, household, other (${CATEGORY_GUIDE}).
   - section: the part of the recipe it belongs to, as the recipe names it (Marinade, Sauce, For the noodles); null when the recipe has one list. When the recipe has sections, give every ingredient its section. Keep every line, even when an ingredient appears in several sections (soy sauce in the marinade and soy sauce in the sauce are two entries).
5. steps: the preparation steps in order, in the source language, one step per entry, without numbering. If the steps are only shown visually, describe each one briefly in the source language. Do not add steps the source does not show.
   step_starts: only for a video, the second where each step starts (same order and length as steps; null for a step you can't place); otherwise null.
6. title: the dish name as the source gives it, in the source language. servings: how many people it serves if stated, else null. total_minutes: the total time if stated, else null. language: ISO 639-1 code of the source ("es", "en", "fr").
7. image_shows_dish: true only when an image you were given shows the prepared dish (not just text or a screenshot of text).

Known products: ${knownProducts.map((n) => n.toLowerCase()).join(', ')}.`;
}

export function translationSystemPrompt(knownProducts: readonly string[]): string {
  return `You map recipe ingredient lines (any language) to canonical English grocery product names for a household shopping list.
For every line return: i (the line number you were given), name_en (singular, lowercase, no amounts, sizes or preparation; e.g. "tomato", "chicken breast", "corn tortilla"; ${NAME_EN_RULE}), category (produce, bakery, meat, dairy, frozen, cupboard, drinks, household or other: ${CATEGORY_GUIDE}) and is_optional (true only if the line says optional, for garnish or to serve).

Known products: ${knownProducts.map((n) => n.toLowerCase()).join(', ')}.`;
}

export function translationUserPrompt(lines: ReadonlyArray<{ i: number; line: string }>): string {
  return `Ingredient lines:\n${JSON.stringify(lines.map(({ i, line }) => ({ i, line })))}`;
}

const cap = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export interface SourceContext {
  /** "YouTube video", "Instagram post", "web page", … */
  kind: string;
  url?: string | null;
  title?: string | null;
  /** Caption, description or other text that came with the content. */
  caption?: string | null;
}

/** The text part sent with the media (or alone, for text sources). */
export function sourcePrompt(ctx: SourceContext, body?: string): string {
  const parts = [`Source: ${ctx.kind}${ctx.url ? ` (${ctx.url})` : ''}.`];
  if (ctx.title) parts.push(`Title: ${cap(ctx.title, 300)}`);
  if (ctx.caption) parts.push(`Caption / description:\n"""\n${cap(ctx.caption, 8000)}\n"""`);
  if (body) parts.push(`Content:\n"""\n${body}\n"""`);
  parts.push('Return the recipe from this content as JSON following the rules.');
  return parts.join('\n\n');
}
