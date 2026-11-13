// The recipe page's ingredient list: each line scaled to the servings and formatted, in the recipe's
// sections ("Marinade", "Sauce", "Noodles": recipe_ingredients.section). Pure.
import { capitalize, formatQuantity, groupBySection, measureWord, scaleQuantity } from '@mesa/shared';

import type { RecipeDetail } from './recipes';

export interface IngredientView {
  id: string;
  name: string;
  quantity: string;
  estimated: boolean;
  optional: boolean;
  /** The part of the recipe it belongs to; null for a recipe with one list. */
  section: string | null;
}

/** Lines of one section in a row; `title` null: no heading (a recipe with one list, lines before the first heading). */
export interface IngredientSection {
  key: string;
  title: string | null;
  rows: IngredientView[];
}

/**
 * Ingredients scaled from the recipe's servings to `servings`, formatted for display. A line whose unit
 * has no code shows the word it used ("1 thumb ginger" → "¾ thumb").
 */
export function scaledIngredients(recipe: RecipeDetail, servings: number): IngredientView[] {
  return recipe.ingredients.map((i) => ({
    id: i.id,
    name: capitalize(i.name),
    quantity: formatQuantity(
      scaleQuantity(i.quantity, recipe.servings, servings),
      i.unit,
      i.unit === null ? measureWord(i.raw_text, i.name) : null,
    ),
    estimated: i.is_guessed,
    optional: i.is_optional,
    section: i.section,
  }));
}

/** The lines by section, in recipe order. A section's key is its name (and how many times it came before), so it stays put as lines come and go. */
export function ingredientSections(lines: readonly IngredientView[]): IngredientSection[] {
  const seen = new Map<string, number>();
  return groupBySection(lines).map((g) => {
    const name = g.section ?? '';
    const before = seen.get(name) ?? 0;
    seen.set(name, before + 1);
    return { key: `${name}#${before}`, title: g.section, rows: g.rows };
  });
}
