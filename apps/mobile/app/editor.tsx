import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  draftFromRecipe,
  friendlyError,
  useCatalogIndex,
  useHousehold,
  useRecipe,
  useSaveRecipe,
  type RecipeDraft,
} from '@/data';
import {
  Banner,
  Button,
  ErrorState,
  Field,
  LoadingState,
  ModalBar,
  Screen,
  Stack,
  Stepper,
  TextField,
  openAfterModal,
  useUnsavedGuard,
} from '@/ds';

/** Something typed or changed since it opened (spaces around the words don't count). */
function changed(a: RecipeDraft, b: RecipeDraft): boolean {
  return (
    a.servings !== b.servings ||
    a.title.trim() !== b.title.trim() ||
    a.minutes !== b.minutes ||
    a.ingredients.trim() !== b.ingredients.trim() ||
    a.steps.trim() !== b.steps.trim()
  );
}

/**
 * The whole recipe, by hand. A modal screen like the others (× at the top right); a recipe being written
 * never goes by mistake: the ×, the swipe down and any way back ask "Discard changes?" first.
 */
export default function RecipeEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const recipe = useRecipe(id);
  const household = useHousehold();
  const save = useSaveRecipe(useCatalogIndex());
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const editing = !!id;
  const loaded = !editing || (recipe.data && !recipe.isPlaceholderData);
  const original = loaded ? draftFromRecipe(editing ? recipe.data : undefined, household.data?.default_servings ?? 3) : null;
  const leave = useUnsavedGuard(!!draft && !!original && changed(draft, original));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/recipes'));
  const header = <ModalBar title={editing ? 'Edit recipe' : 'New recipe'} onClose={back} closeLabel="Cancel" />;

  if (!original) {
    return (
      <Screen modal header={header}>
        {recipe.isError ? <ErrorState onRetry={() => void recipe.refetch()} /> : <LoadingState />}
      </Screen>
    );
  }

  const value = draft ?? original;
  const set = (patch: Partial<RecipeDraft>) => setDraft({ ...value, ...patch });
  const canSave = value.title.trim().length > 0;

  const onSave = () =>
    save.mutate(
      { draft: value, previous: editing ? recipe.data : undefined },
      {
        onSuccess: (savedId) => {
          // Saved: leaving now loses nothing, so it doesn't ask.
          leave();
          back();
          // A new recipe opens once this sheet is down (its header in place).
          if (!editing) openAfterModal(() => router.push({ pathname: '/recipe/[id]', params: { id: savedId } }));
        },
      },
    );

  return (
    <Screen
      modal
      header={header}
      gap="xl"
      footer={<Button label="Save recipe" size="lg" fullWidth disabled={!canSave} loading={save.isPending} onPress={onSave} />}
    >
      <TextField label="Recipe name" placeholder="Lemon chicken" value={value.title} onChangeText={(title) => set({ title })} autoCapitalize="sentences" />
      <Stack gap="lg">
        <Field inline label="Servings" hint="The amounts below are for this many">
          <Stepper value={value.servings} onChange={(servings) => set({ servings })} min={1} max={50} label="Servings" />
        </Field>
        <Field label="Total time">
          <TextField
            label="Minutes"
            placeholder="Minutes, like 30"
            value={value.minutes}
            onChangeText={(minutes) => set({ minutes: minutes.replace(/\D/g, '') })}
            keyboardType="number-pad"
          />
        </Field>
      </Stack>
      <Field label="Ingredients" hint="One per line, like “2 tbsp olive oil”. A heading line like “Sauce:” or “[Sauce]” starts a section.">
        <TextField
          multiline
          rows={6}
          label="Ingredients"
          placeholder={'2 tomatoes\n1 onion\n500 g chicken'}
          value={value.ingredients}
          onChangeText={(ingredients) => set({ ingredients })}
          autoCapitalize="sentences"
        />
      </Field>
      <Field label="Steps" hint="One step per line.">
        <TextField
          multiline
          rows={6}
          label="Steps"
          placeholder={'Chop the onion.\nFry it with the chicken.'}
          value={value.steps}
          onChangeText={(steps) => set({ steps })}
          autoCapitalize="sentences"
        />
      </Field>
      {save.error ? <Banner tone="danger" text={friendlyError(save.error, "Couldn't save the recipe. Try again.")} /> : null}
    </Screen>
  );
}
