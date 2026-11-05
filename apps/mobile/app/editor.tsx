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
import { Banner, Button, ErrorState, Field, LoadingState, Screen, Stack, Stepper, TextField, TopBar } from '@/ds';

export default function RecipeEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const recipe = useRecipe(id);
  const household = useHousehold();
  const save = useSaveRecipe(useCatalogIndex());
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const editing = !!id;
  const loaded = !editing || (recipe.data && !recipe.isPlaceholderData);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/recipes'));
  const header = <TopBar title={editing ? 'Edit recipe' : 'New recipe'} onBack={back} backIcon="close" backLabel="Cancel" />;

  if (!loaded) {
    return (
      <Screen header={header}>
        {recipe.isError ? <ErrorState onRetry={() => void recipe.refetch()} /> : <LoadingState />}
      </Screen>
    );
  }

  const value = draft ?? draftFromRecipe(editing ? recipe.data : undefined, household.data?.default_servings ?? 3);
  const set = (patch: Partial<RecipeDraft>) => setDraft({ ...value, ...patch });
  const canSave = value.title.trim().length > 0;

  const onSave = () =>
    save.mutate(
      { draft: value, previous: editing ? recipe.data : undefined },
      {
        onSuccess: (savedId) => {
          if (editing) back();
          else router.replace({ pathname: '/recipe/[id]', params: { id: savedId } });
        },
      },
    );

  return (
    <Screen
      header={header}
      gap="xl"
      footer={<Button label="Save recipe" size="lg" fullWidth disabled={!canSave} loading={save.isPending} onPress={onSave} />}
    >
      <TextField label="Recipe name" placeholder="Tacos de pollo" value={value.title} onChangeText={(title) => set({ title })} autoCapitalize="sentences" />
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
      <Field label="Ingredients" hint="One per line, like “2 cdas de aceite” or “500 g chicken”.">
        <TextField
          multiline
          rows={6}
          label="Ingredients"
          placeholder={'2 jitomates\n1 cebolla\n500 g pollo'}
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
