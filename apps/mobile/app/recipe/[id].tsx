import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  availabilityLine,
  formatMinutes,
  friendlyError,
  ingredientSections,
  recipeCreator,
  recipeImageUrl,
  scaledIngredients,
  sourceLabel,
  useAskSheets,
  useRereadIngredients,
  useCookRecipe,
  useHousehold,
  useIngredientEditor,
  useKeepScreenOn,
  useOpenUrl,
  usePantryActions,
  usePlanWithUndo,
  useRecipe,
  useRecipeAvailability,
  useRecipeSteps,
  useFavoriteHeart,
  useShareText,
  type Notify,
} from '@/data';
import {
  Button,
  ButtonRow,
  Chip,
  ChipRow,
  CreatorLink,
  EmptyState,
  ErrorState,
  IconButton,
  IngredientList,
  IngredientSheet,
  Inline,
  ListSkeleton,
  LoadingState,
  Meta,
  ProgressNote,
  RecipeHero,
  RecipeSteps,
  Screen,
  SectionHeader,
  Stack,
  StatRow,
  Stepper,
  Text,
  TopBar,
  showActions,
  useToast,
} from '@/ds';

export default function RecipeDetailScreen() {
  // translated: opened from "Tinga is translated" (a toast, a notification).
  const { id, translated } = useLocalSearchParams<{ id: string; translated?: string }>();
  const router = useRouter();
  const toast = useToast();
  const notify: Notify = (message, notice) => toast.show({ message, ...notice });
  const recipe = useRecipe(id);
  const household = useHousehold();
  // Tap an ingredient to change it; the pencil still opens the whole recipe.
  const ingredientEditor = useIngredientEditor(recipe.data, notify);
  // The first heart on this phone also says where favorites show up.
  const toggleFavorite = useFavoriteHeart(toast.show);
  const plan = usePlanWithUndo(notify);
  const cook = useCookRecipe();
  const openUrl = useOpenUrl();
  const share = useShareText();
  const availability = useRecipeAvailability(recipe.data && !recipe.isPlaceholderData ? recipe.data : undefined);
  const pantryActions = usePantryActions(notify);
  const [servings, setServings] = useState<number | null>(null);
  const reading = useRecipeSteps(
    recipe.data && !recipe.isPlaceholderData ? recipe.data : undefined,
    (message) => toast.show({ message, tone: 'error' }),
    translated === '1',
  );
  // "More from …" opens the app's creator sheet; "Ask about this recipe" Ask Mesa, about it.
  const sheets = useAskSheets();
  const reread = useRereadIngredients(recipe.data ? { id: recipe.data.id, title: recipe.data.title } : undefined);
  useKeepScreenOn();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/recipes'));
  const r = recipe.data;
  if (!r) {
    return (
      <Screen header={<TopBar onBack={back} />}>
        {recipe.isError ? <ErrorState title="Couldn't open this recipe" onRetry={() => void recipe.refetch()} /> : <LoadingState />}
      </Screen>
    );
  }

  const people = servings ?? household.data?.default_servings ?? r.servings;
  const title = reading.title ?? r.title;
  const source = sourceLabel(r);
  const minutes = formatMinutes(r.total_minutes);
  const ingredients = scaledIngredients(r, people);
  const loadingDetails = recipe.isPlaceholderData;
  // "More from Food is Love" (their latest videos) or "By Food is Love".
  const creator = loadingDetails ? null : recipeCreator(r);
  const creatorTarget = creator?.target ?? null;
  const edit = () => router.push({ pathname: '/editor', params: { id: r.id } });
  // Servings live in the stepper below; the stats keep what the stepper doesn't say.
  const stats = [
    ...(minutes ? [{ value: minutes, label: 'Total time' }] : []),
    ...(availability.ready && availability.total > 0 ? [{ value: `${availability.have} of ${availability.total}`, label: 'At home' }] : []),
  ];

  // The add haptic comes with the tap (the button), not when the server answers.
  const onPlan = () => plan.plan(r.id, { servings: people });

  const onCooked = () =>
    cook.mutate(
      { recipeId: r.id, title: r.title, servings: people },
      {
        // The success buzz comes with the seal on the Cooked screen.
        onSuccess: () => router.push({ pathname: '/cooked/[id]', params: { id: r.id } }),
        onError: (e) => toast.show({ message: friendlyError(e, "Couldn't update the pantry. Try again."), tone: 'error' }),
      },
    );

  return (
    <Screen
      fullBleedTop
      gap="xxl"
      header={
        <TopBar
          floating
          title={title}
          onBack={back}
          actions={
            <>
              <IconButton
                variant="float"
                icon="favorite"
                filled={r.is_favorite}
                selected={r.is_favorite}
                accessibilityLabel={r.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                haptic="select"
                onPress={() => toggleFavorite(r)}
              />
              <IconButton
                variant="float"
                icon="more"
                accessibilityLabel="More"
                accessibilityHint="Share, edit, or have Mesa read the ingredients again"
                onPress={() =>
                  showActions([
                    { label: 'Share', onPress: () => share(r.source_url ? `${r.title}\n${r.source_url}` : r.title) },
                    { label: 'Edit recipe', onPress: edit },
                    { label: 'Redo ingredients', onPress: reread.start },
                  ])
                }
              />
            </>
          }
        />
      }
      footerBar
      footer={
        <ButtonRow>
          <Button label="Plan it" variant="secondary" size="lg" fullWidth haptic="add" loading={plan.planning} disabled={loadingDetails} onPress={onPlan} />
          <Button label="Cooked!" size="lg" fullWidth loading={cook.isPending} disabled={loadingDetails} onPress={onCooked} />
        </ButtonRow>
      }
    >
      <RecipeHero imageUrl={recipeImageUrl(r.image_path)} seed={r.id}>
        <Stack gap="sm">
          {source || r.source_url ? (
            <Inline justify="between">
              {source ? <Meta icon={r.source_platform === 'youtube' ? 'play' : 'link'} text={source} /> : null}
              {r.source_url ? <Button label="View original" variant="ghost" onPress={() => openUrl(r.source_url!)} /> : null}
            </Inline>
          ) : null}
          <Text variant="display">{title}</Text>
          {creator ? (
            <CreatorLink
              name={creator.name}
              label={creator.label}
              onPress={creatorTarget ? () => sheets.openCreator(creatorTarget) : undefined}
            />
          ) : null}
          {loadingDetails ? null : (
            <ChipRow wrap accessibilityLabel="Ask Mesa">
              <Chip
                label="Ask about this recipe"
                icon="sparkle"
                accessibilityHint="Swaps, servings, timing: Mesa answers from your kitchen"
                onPress={() => sheets.openAskAbout(r.id)}
              />
            </ChipRow>
          )}
        </Stack>

        <StatRow items={stats} />
      </RecipeHero>

      <Stack inset gap="md">
        {/* How many it is for and what is at home, right where the amounts are. */}
        <Stack gap="xs">
          <Inline justify="between" align="center" gap="md">
            <Stack flex>
              <SectionHeader title="Ingredients" />
            </Stack>
            <Stepper value={people} onChange={setServings} min={1} max={50} label="Servings" format={(n) => `${n} servings`} />
          </Inline>
          {reread.working ? <ProgressNote text="Reading the ingredients again, line by line…" canLeave /> : null}
          {loadingDetails ? null : (
            <Text variant="caption" color="inkMuted">
              {[
                people === r.servings ? null : `The original serves ${r.servings}; amounts are adjusted.`,
                availability.ready && availability.total > 0 ? availabilityLine(availability) : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Text>
          )}
        </Stack>
        {loadingDetails ? (
          <ListSkeleton rows={4} leading="picto" />
        ) : ingredients.length === 0 ? (
          <EmptyState size="section" title="No ingredients yet" />
        ) : (
          // By the recipe's sections ("Marinade", "Sauce"); each line keeps its own mark, tap and Undo.
          <IngredientList
            sections={ingredientSections(ingredients).map((s) => ({
              ...s,
              rows: s.rows.map((i) => {
                const a = availability.byId.get(i.id);
                return {
                  key: i.id,
                  name: i.name,
                  quantity: i.quantity,
                  picto: a?.picto ?? 'jar',
                  status: a?.status,
                  soon: a?.soon && a.status === 'have',
                  estimated: i.estimated,
                  optional: i.optional,
                  onPress: () => ingredientEditor.open(i.id),
                  onMarkHave: a?.status === 'buy' && a.productId ? () => pantryActions.have(a.productId!, i.name) : undefined,
                };
              }),
            }))}
          />
        )}
        {loadingDetails ? null : <Button label="Add ingredient" variant="ghost" iconStart="add" fullWidth onPress={ingredientEditor.add} />}
      </Stack>

      {reading.steps.length > 0 ? (
        <Stack inset>
          <RecipeSteps steps={reading.steps} translate={reading.translate} />
        </Stack>
      ) : null}

      <IngredientSheet {...ingredientEditor.sheet} />
    </Screen>
  );
}
