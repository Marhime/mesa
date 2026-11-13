// "Redo ingredients": Mesa reads a recipe's ingredient lines again, one by one, as the editor shows them,
// with today's naming and matching rules (a 'reread' job in the quick lane): each line's name, its link to
// the pantry, its amount. The recipe keeps its title, steps, favorite and history. When the job is done the
// recipe and what is at home for it refresh; elsewhere in the app the Mesa button and a toast say so.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { refresh } from './refresh';
import { useWorkerAsk } from './workerAsk';

export function useRereadIngredients(recipe: { id: string; title: string } | undefined) {
  const qc = useQueryClient();
  const ask = useWorkerAsk('reread');
  const done = ask.phase === 'done';
  const recipeId = recipe?.id;

  useEffect(() => {
    if (done && recipeId) refresh(qc, 'recipe', { recipeId });
  }, [done, recipeId, qc]);

  return {
    /** Mesa is reading them (from this screen). */
    working: ask.phase === 'working',
    start: () => {
      if (!recipe || ask.phase === 'working') return;
      ask.ask({ subjectId: recipe.id, label: recipe.title, reuseDone: false });
    },
  };
}
