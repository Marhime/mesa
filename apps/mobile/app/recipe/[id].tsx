import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  availabilityLine,
  formatMinutes,
  friendlyError,
  plural,
  recipeImageUrl,
  scaledIngredients,
  sourceLabel,
  useCookRecipe,
  useHousehold,
  useKeepScreenOn,
  useOpenUrl,
  usePantryActions,
  usePlanRecipe,
  useRecipe,
  useRecipeAvailability,
  useShareText,
  useToggleFavorite,
  useUnplan,
} from '@/data';
import {
  Button,
  ButtonRow,
  ErrorState,
  Field,
  IconButton,
  IngredientRow,
  Inline,
  ListGroup,
  ListSkeleton,
  LoadingState,
  Meta,
  RecipeHero,
  Screen,
  SectionHeader,
  SegmentBar,
  Stack,
  StatRow,
  StepRow,
  Stepper,
  Text,
  TopBar,
  haptics,
  useToast,
} from '@/ds';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const recipe = useRecipe(id);
  const household = useHousehold();
  const favorite = useToggleFavorite();
  const plan = usePlanRecipe();
  const unplan = useUnplan();
  const cook = useCookRecipe();
  const openUrl = useOpenUrl();
  const share = useShareText();
  const availability = useRecipeAvailability(recipe.data && !recipe.isPlaceholderData ? recipe.data : undefined);
  const pantryActions = usePantryActions((message, action) => toast.show({ message, action }));
  const [servings, setServings] = useState<number | null>(null);
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
  const source = sourceLabel(r);
  const minutes = formatMinutes(r.total_minutes);
  const ingredients = scaledIngredients(r, people);
  const loadingDetails = recipe.isPlaceholderData;
  const edit = () => router.push({ pathname: '/editor', params: { id: r.id } });
  const stats = [
    ...(minutes ? [{ value: minutes, label: 'Total time' }] : []),
    { value: String(people), label: 'Servings' },
    ...(availability.ready && availability.total > 0 ? [{ value: `${availability.have} of ${availability.total}`, label: 'At home' }] : []),
  ];

  const onPlan = () =>
    plan.mutate(
      { recipeId: r.id, servings: people },
      {
        onSuccess: ({ upNextId, items }) => {
          haptics.add();
          toast.show({
            message: items > 0 ? `Added to Up next · ${plural(items, 'item', 'items')} on your list` : 'Added to Up next · all at home',
            action: { label: 'Undo', onPress: () => unplan.mutate(upNextId) },
          });
        },
        onError: (e) => toast.show({ message: friendlyError(e, "Couldn't plan it. Try again.") }),
      },
    );

  const onCooked = () =>
    cook.mutate(
      { recipeId: r.id, title: r.title, servings: people },
      {
        onSuccess: () => {
          haptics.success();
          router.push({ pathname: '/cooked/[id]', params: { id: r.id } });
        },
        onError: (e) => toast.show({ message: friendlyError(e, "Couldn't update the pantry. Try again.") }),
      },
    );

  return (
    <Screen
      fullBleedTop
      gap="xxl"
      header={
        <TopBar
          floating
          onBack={back}
          actions={
            <>
              <IconButton
                variant="float"
                icon="favorite"
                filled={r.is_favorite}
                selected={r.is_favorite}
                accessibilityLabel={r.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                onPress={() => favorite.mutate({ id: r.id, favorite: !r.is_favorite })}
              />
              <IconButton
                variant="float"
                icon="share"
                accessibilityLabel="Share"
                onPress={() => share(r.source_url ? `${r.title}\n${r.source_url}` : r.title)}
              />
              <IconButton variant="float" icon="edit" accessibilityLabel="Edit recipe" onPress={edit} />
            </>
          }
        />
      }
      footerBar
      footer={
        <ButtonRow>
          <Button label="Plan it" variant="secondary" size="lg" fullWidth loading={plan.isPending} disabled={loadingDetails} onPress={onPlan} />
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
          <Text variant="display">{r.title}</Text>
        </Stack>

        <StatRow items={stats} />

        {availability.ready && availability.total > 0 && !loadingDetails ? (
          <Stack gap="sm">
            <SegmentBar
              size="lg"
              total={availability.total}
              filled={availability.have}
              accessibilityLabel={`${availability.have} of ${availability.total} ingredients at home`}
            />
            <Text variant="caption" color="inkMuted">
              {availabilityLine(availability)}
            </Text>
          </Stack>
        ) : null}

        <Field
          inline
          label="Servings"
          hint={people === r.servings ? 'Quantities follow the servings.' : `The original serves ${r.servings}. Quantities are adjusted.`}
        >
          <Stepper value={people} onChange={setServings} min={1} max={50} label="Servings" />
        </Field>
      </RecipeHero>

      <Stack inset gap="md">
        <SectionHeader title="Ingredients" meta={loadingDetails ? undefined : `for ${people}`} />
        {loadingDetails ? (
          <ListSkeleton rows={4} />
        ) : ingredients.length === 0 ? (
          <Text variant="body" color="inkMuted">
            No ingredients yet. Tap edit to add them.
          </Text>
        ) : (
          <ListGroup inset="none">
            {ingredients.map((i) => {
              const a = availability.byId.get(i.id);
              return (
                <IngredientRow
                  key={i.id}
                  name={i.name}
                  quantity={i.quantity}
                  category={a?.category ?? 'other'}
                  status={a?.status}
                  soon={a?.soon && a.status === 'have'}
                  estimated={i.estimated}
                  optional={i.optional}
                  onPress={edit}
                  onMarkHave={
                    a?.status === 'buy' && a.productId
                      ? () => {
                          haptics.add();
                          pantryActions.have(a.productId!, i.name);
                        }
                      : undefined
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </Stack>

      {r.steps.length > 0 ? (
        <Stack inset gap="lg">
          <SectionHeader title="Steps" />
          {r.steps.map((s, i) => (
            <StepRow key={s.id} number={i + 1} text={s.text} />
          ))}
        </Stack>
      ) : null}
    </Screen>
  );
}
