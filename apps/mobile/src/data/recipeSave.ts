// The recipe editor's text and saving it: one ingredient or step per line, and a heading line ending with ":"
// where the ingredients' section changes ("For the sauce:", packages/shared/src/sections.ts). Saving rewrites
// the lines; a line left as it was keeps its id and what the import knew. `recipes.original` is never touched.
import { linesWithHeadings, matchProduct, parseIngredientLine, readSections, type CatalogIndex } from '@mesa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { RecipeDetail } from './recipes';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

export interface RecipeDraft {
  title: string;
  servings: number;
  minutes: string;
  ingredients: string;
  steps: string;
}

/** Editor fields for an existing recipe (one ingredient / step per line, a heading line where a section starts). */
export function draftFromRecipe(r: RecipeDetail | undefined, defaultServings: number): RecipeDraft {
  if (!r) return { title: '', servings: defaultServings, minutes: '', ingredients: '', steps: '' };
  return {
    title: r.title,
    servings: r.servings,
    minutes: r.total_minutes ? String(r.total_minutes) : '',
    ingredients: linesWithHeadings(r.ingredients, (i) => i.raw_text).join('\n'),
    steps: r.steps.map((s) => s.text).join('\n'),
  };
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*]\s*|\d+[.)]\s+)/, '').trim())
    .filter((l) => l.length > 0);
}

/** A previous row for each line the editor left as it was (each row used once): it keeps its id and what the import knew. */
function keptRows<T extends { id: string }>(previous: readonly T[], text: (row: T) => string) {
  const pool = [...previous];
  return (line: string): T | undefined => {
    const at = pool.findIndex((row) => text(row).trim() === line);
    return at < 0 ? undefined : pool.splice(at, 1)[0];
  };
}

type ChildRow = { id?: string; recipe_id: string; position: number };

/** Ingredients from the editor: every line takes its place and the section of the heading above it. */
function ingredientRows(recipeId: string, text: string, index: CatalogIndex | null, previous: RecipeDetail | undefined): ChildRow[] {
  const keep = keptRows(previous?.ingredients ?? [], (i) => i.raw_text);
  return readSections(lines(text)).map(({ line, section }, position) => {
    // An untouched line keeps its id and what the import knew (estimated amounts, optional flags).
    const kept = keep(line);
    if (kept) return { ...kept, recipe_id: recipeId, position, section };
    const parsed = parseIngredientLine(line);
    const name = parsed.label || line;
    const product = index ? matchProduct(index, name) : null;
    return {
      recipe_id: recipeId,
      position,
      section,
      raw_text: line,
      name,
      product_id: product?.id ?? null,
      quantity: parsed.quantity,
      unit: parsed.unit,
      is_guessed: false,
      is_optional: false,
    };
  });
}

/** Steps from the editor; an untouched step keeps its id and where it starts in the video. */
function stepRows(recipeId: string, text: string, previous: RecipeDetail | undefined): ChildRow[] {
  const keep = keptRows(previous?.steps ?? [], (s) => s.text);
  return lines(text).map((line, position) => {
    const kept = keep(line);
    return kept ? { ...kept, recipe_id: recipeId, position } : { recipe_id: recipeId, position, text: line };
  });
}

/**
 * Writes a recipe's ingredients or steps: lines kept as they were are updated in place (same id, new
 * position and section), new ones go in, and only then the others are deleted, so a failed save never leaves
 * the recipe empty (retrying converges).
 */
async function replaceChildren(table: 'recipe_ingredients' | 'recipe_steps', recipeId: string, rows: ChildRow[]): Promise<void> {
  const old = must(await supabase.from(table).select('id').eq('recipe_id', recipeId)) as { id: string }[];
  const kept = rows.filter((r) => r.id);
  const added = rows.filter((r) => !r.id);
  if (kept.length > 0) must(await supabase.from(table).upsert(kept, { onConflict: 'id' }));
  if (added.length > 0) must(await supabase.from(table).insert(added));
  const keep = new Set(kept.map((r) => r.id));
  const stale = old.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (stale.length > 0) must(await supabase.from(table).delete().in('id', stale));
}

/** Creates or edits a recipe; its lines are rewritten (untouched ones keep their id). `recipes.original` is never touched. */
export function useSaveRecipe(index: CatalogIndex | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, previous }: { draft: RecipeDraft; previous?: RecipeDetail }): Promise<string> => {
      const minutes = Number.parseInt(draft.minutes, 10);
      const fields = {
        title: draft.title.trim(),
        servings: draft.servings,
        total_minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
      };
      let id = previous?.id;
      if (id) {
        must(await supabase.from('recipes').update(fields).eq('id', id));
      } else {
        const row = must(await supabase.from('recipes').insert({ ...fields, source_platform: 'manual' }).select('id').single()) as { id: string };
        id = row.id;
      }
      const recipeId = id;
      await replaceChildren('recipe_ingredients', recipeId, ingredientRows(recipeId, draft.ingredients, index, previous));
      await replaceChildren('recipe_steps', recipeId, stepRows(recipeId, draft.steps, previous));
      return recipeId;
    },
    // Its lines may have new ids: what is at home for it ("Have / To buy") is read again with them.
    onSuccess: (id) => refresh(qc, 'recipe', { recipeId: id }),
  });
}
