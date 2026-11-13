import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  formatMinutes,
  formatOverlineDate,
  plural,
  upNextTileData,
  TIP,
  useAskSheets,
  useCanPlanWeek,
  useCookAgain,
  useHousehold,
  useHouseholdId,
  useHouseholdPeople,
  useIdeas,
  useImportsPanel,
  usePantry,
  usePlanWithUndo,
  usePullToRefresh,
  useRecipeCoverage,
  useTip,
  useUnplan,
  useUpNext,
  type IdeaView,
  type Notify,
  type UpNextEntry,
} from '@/data';
import {
  AvatarGroup,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldButton,
  IconButton,
  IdeaCard,
  ImportList,
  LargeTitle,
  Rail,
  RailSkeleton,
  RecipeRail,
  Screen,
  SectionHeader,
  Stack,
  TipCard,
  UpNextTile,
  UseSoonCard,
  showActions,
  size,
  useToast,
} from '@/ds';

export default function HomeScreen() {
  const router = useRouter();
  const toast = useToast();
  const notify: Notify = (message, notice) => toast.show({ message, ...notice });
  const people = useHouseholdPeople();
  const householdId = useHouseholdId();
  const household = useHousehold();
  // Once there is someone to share with, say whose kitchen this is (once per kitchen).
  const welcome = useTip(householdId && people.names.length > 1 ? TIP.welcome(householdId) : null);
  const upNext = useUpNext();
  const imports = useImportsPanel({
    notify,
    openRecipe: (id) => router.push({ pathname: '/recipe/[id]', params: { id } }),
    openPantry: () => router.navigate('/pantry'),
  });
  const pantry = usePantry();
  const coverage = useRecipeCoverage();
  const { ideas } = useIdeas();
  // Favorites nobody has cooked in two weeks.
  const cookAgain = useCookAgain();
  const plan = usePlanWithUndo(notify);
  const unplan = useUnplan();
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [removing, setRemoving] = useState<UpNextEntry | null>(null);
  const pull = usePullToRefresh(upNext.refetch, imports.refetch, pantry.refetch, coverage.refetch);
  // A Use soon card asks for dishes that use it (the app's ideas sheet).
  const sheets = useAskSheets();
  // Dinners for the week, picked by Mesa among your recipes (the app's week plan sheet).
  const canPlanWeek = useCanPlanWeek();

  const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });
  const idea = ideas.length > 0 ? ideas[ideaIndex % ideas.length] : undefined;
  const entries = upNext.data ?? [];

  // The add haptic came with the tap (IdeaCard).
  const planIdea = (i: IdeaView) => plan.plan(i.recipeId);

  return (
    <Screen tabBar refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <Stack gap="lg">
        <LargeTitle
          overline={formatOverlineDate(new Date())}
          overlineAccessory={
            <AvatarGroup names={people.names} onPress={() => router.push('/settings')} accessibilityLabel="Household and settings" />
          }
          title="What's for dinner?"
          action={
            <IconButton
              icon="add"
              variant="ink"
              accessibilityLabel="Add"
              accessibilityHint="A recipe, something to buy or something you have"
              onPress={() =>
                showActions([
                  { label: 'Add a recipe', onPress: () => router.navigate({ pathname: '/recipes', params: { add: String(Date.now()) } }) },
                  { label: 'Add to groceries', onPress: () => router.navigate({ pathname: '/groceries', params: { add: String(Date.now()) } }) },
                  { label: 'Add to the pantry', onPress: () => router.navigate({ pathname: '/pantry', params: { stock: String(Date.now()) } }) },
                ])
              }
            />
          }
        />
        {welcome.visible ? (
          <TipCard
            icon="users"
            title={`You're in ${household.data?.name ?? 'your kitchen'}`}
            text={`${people.sharedWith}. The list, recipes and pantry update on both phones as you go.`}
            onDismiss={welcome.dismiss}
          />
        ) : null}
        {pantry.data && pantry.all.length === 0 ? (
          <FieldButton
            icon="list"
            title="Stock your pantry"
            subtitle="So ideas and your list match your kitchen"
            accessibilityHint="Opens Pantry to tick what you already have"
            onPress={() => router.navigate({ pathname: '/pantry', params: { stock: String(Date.now()) } })}
          />
        ) : null}
      </Stack>

      {idea ? (
        <IdeaCard
          overline="Tonight's idea"
          title={idea.title}
          text={idea.text}
          imageUrl={idea.imageUrl}
          seed={idea.recipeId}
          sticker={idea.sticker}
          minutes={formatMinutes(idea.minutes) ?? undefined}
          shopping={idea.shopping}
          actionLabel="Cook tonight"
          onAction={() => openRecipe(idea.recipeId)}
          onPress={() => openRecipe(idea.recipeId)}
          onAnother={ideas.length > 1 ? () => setIdeaIndex((i) => i + 1) : undefined}
          onPlan={() => planIdea(idea)}
        />
      ) : null}

      <ImportList title={imports.title} rows={imports.rows} />

      <Stack gap="md">
        <SectionHeader title="On the menu" meta={entries.length > 0 ? plural(entries.length, 'recipe', 'recipes') : undefined} />
        {upNext.isLoading ? (
          <RailSkeleton itemWidth={size.upNextCard} />
        ) : upNext.isError && !upNext.data ? (
          <ErrorState size="section" onRetry={() => void upNext.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState
            size="section"
            title="Nothing planned yet"
            text="Open a recipe and tap Plan it. What's missing lands on your list."
            action={{ label: 'Browse recipes', onPress: () => router.navigate('/recipes') }}
          />
        ) : (
          <Rail accessibilityLabel="On the menu" itemWidth={size.upNextCard}>
            {entries.map((entry) => {
              const tile = upNextTileData(entry, coverage.byRecipe.get(entry.recipe_id));
              return (
                <UpNextTile
                  key={entry.id}
                  {...tile}
                  onPress={() => openRecipe(entry.recipe_id)}
                  onLongPress={() => setRemoving(entry)}
                />
              );
            })}
          </Rail>
        )}
        {canPlanWeek ? (
          <FieldButton
            icon="plan"
            title="Plan my week"
            subtitle="Mesa suggests dinners from your recipes"
            accessibilityHint="You pick which ones go on the menu"
            onPress={() => sheets.openWeekPlan()}
          />
        ) : null}
      </Stack>

      {pantry.useSoon.length > 0 ? (
        <Stack gap="md">
          <SectionHeader
            title="Use soon"
            subtitle="Tap one for dishes that use it"
            action={{ label: 'Pantry', onPress: () => router.navigate('/pantry') }}
          />
          <Rail accessibilityLabel="Use soon">
            {pantry.useSoon.map((item) => (
              <UseSoonCard
                key={item.key}
                name={item.name}
                picto={item.picto}
                when={item.when}
                urgent={item.urgent}
                freshness={item.freshness}
                onPress={() => sheets.openIdeas({ productId: item.productId, name: item.name })}
              />
            ))}
          </Rail>
        </Stack>
      ) : null}

      <RecipeRail title="Cook again" subtitle="Favorites you haven't made lately" recipes={cookAgain} onOpen={openRecipe} />

      <ConfirmSheet
        visible={removing !== null}
        title="Take it off the menu?"
        text="What only this recipe needed comes off your list."
        confirmLabel="Take it off"
        tone="danger"
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) unplan.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </Screen>
  );
}
