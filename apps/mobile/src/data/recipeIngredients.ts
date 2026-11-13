// Changing one ingredient of a recipe (tap it on the recipe screen) or adding one, without retyping the
// whole list in the editor; removing one says so with Undo. A new one goes at the end, in the last line's
// section; a changed one stays in its own. `recipes.original` (what the import read) is never touched.
import { capitalize, formatQuantity, matchProduct, type RecipeIngredient, type Unit } from '@mesa/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useCatalogIndex } from './catalog';
import { undoNotice, type Notify } from './notice';
import type { RecipeDetail } from './recipes';
import { refresh } from './refresh';
import { must, supabase } from './supabase';

interface Amount {
  quantity: number | null;
  unit: Unit | null;
}

interface Editing {
  key: string;
  /** null for a new ingredient. */
  id: string | null;
  name: string;
  amount: Amount;
  isNew: boolean;
}

/** The recipe's last line (the highest position): a new ingredient follows it, in its section. */
function lastLine(lines: readonly RecipeIngredient[]): RecipeIngredient | undefined {
  return lines.reduce<RecipeIngredient | undefined>((last, i) => (!last || i.position > last.position ? i : last), undefined);
}

/** "2 tbsp olive oil": what the line says once someone changed it by hand. */
function lineText(name: string, amount: Amount): string {
  return [formatQuantity(amount.quantity, amount.unit), name].filter(Boolean).join(' ');
}

/**
 * The ingredient sheet of a recipe: `open(id)` edits one, `add()` starts a new one; saving matches the
 * name to a product (so "Have / To buy" and the grocery list keep working) and refreshes availability.
 */
export function useIngredientEditor(recipe: RecipeDetail | undefined, notify: Notify) {
  const qc = useQueryClient();
  const index = useCatalogIndex();
  const [editing, setEditing] = useState<Editing | null>(null);
  const changed = (recipeId: string) => refresh(qc, 'recipe', { recipeId });

  const save = useMutation({
    meta: { errorMessage: "Couldn't save the ingredient. Try again." },
    mutationFn: async ({ recipeId, id, name, amount }: { recipeId: string; id: string | null; name: string; amount: Amount }) => {
      const product = index ? matchProduct(index, name) : null;
      const row = {
        name,
        quantity: amount.quantity,
        unit: amount.quantity === null ? null : amount.unit,
        raw_text: lineText(name, amount),
        product_id: product?.id ?? null,
        is_guessed: false,
      };
      if (id) {
        must(await supabase.from('recipe_ingredients').update(row).eq('id', id));
      } else {
        const last = lastLine(recipe?.ingredients ?? []);
        must(
          await supabase
            .from('recipe_ingredients')
            .insert({ ...row, recipe_id: recipeId, position: (last?.position ?? -1) + 1, section: last?.section ?? null, is_optional: false }),
        );
      }
    },
    onSettled: (_d, _e, v) => changed(v.recipeId),
  });

  const remove = useMutation({
    meta: { errorMessage: "Couldn't remove the ingredient. Try again." },
    mutationFn: async ({ id }: { recipeId: string; id: string }) => {
      must(await supabase.from('recipe_ingredients').delete().eq('id', id));
    },
    onSettled: (_d, _e, v) => changed(v.recipeId),
  });

  // Undo puts the very line back: same id, same place and section, what the import knew.
  const restore = useMutation({
    meta: { errorMessage: "Couldn't put the ingredient back. Try again." },
    mutationFn: async (row: RecipeIngredient) => {
      must(await supabase.from('recipe_ingredients').insert(row));
    },
    onSettled: (_d, _e, row) => changed(row.recipe_id),
  });

  const close = () => setEditing(null);

  return {
    open: (id: string) => {
      const i = recipe?.ingredients.find((x) => x.id === id);
      if (!i) return;
      setEditing({
        key: i.id,
        id: i.id,
        name: capitalize(i.name),
        amount: { quantity: i.quantity === null ? null : Number(i.quantity), unit: i.unit },
        isNew: false,
      });
    },
    add: () => setEditing({ key: `new-${Date.now()}`, id: null, name: '', amount: { quantity: null, unit: null }, isNew: true }),
    sheet: {
      item: editing,
      servingsHint: recipe ? `For ${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}, like the rest of the recipe.` : '',
      saving: save.isPending,
      onClose: close,
      onSave: ({ name, amount }: { name: string; amount: Amount }) => {
        if (!recipe || !editing) return;
        save.mutate({ recipeId: recipe.id, id: editing.id, name, amount }, { onSuccess: () => {
          close();
          notify(editing.isNew ? `Added ${name.toLowerCase()}` : 'Ingredient updated');
        } });
      },
      onRemove: () => {
        const row = recipe?.ingredients.find((i) => i.id === editing?.id);
        if (!recipe || !editing || !row) return;
        const name = editing.name;
        remove.mutate(
          { recipeId: recipe.id, id: row.id },
          { onSuccess: () => notify(`Removed ${name.toLowerCase()}`, undoNotice(() => restore.mutate(row))) },
        );
        close();
      },
    },
  };
}
