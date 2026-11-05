import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  formatMinutes,
  formatOverlineDate,
  friendlyError,
  plural,
  upNextTileData,
  useHouseholdPeople,
  useIdeas,
  useImportsPanel,
  usePantry,
  usePlanRecipe,
  usePullToRefresh,
  useRecipeCoverage,
  useToBuyCount,
  useUnplan,
  useUpNext,
  type IdeaView,
  type UpNextEntry,
} from '@/data';
import {
  AvatarGroup,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldButton,
  IdeaCard,
  ImportList,
  LargeTitle,
  ListSkeleton,
  Rail,
  Screen,
  SectionHeader,
  Stack,
  UpNextTile,
  UseSoonCard,
  haptics,
  useToast,
} from '@/ds';

export default function HomeScreen() {
  const router = useRouter();
  const toast = useToast();
  const people = useHouseholdPeople();
  const toBuy = useToBuyCount();
  const upNext = useUpNext();
  const imports = useImportsPanel();
  const pantry = usePantry();
  const coverage = useRecipeCoverage();
  const { ideas } = useIdeas();
  const plan = usePlanRecipe();
  const unplan = useUnplan();
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [removing, setRemoving] = useState<UpNextEntry | null>(null);
  const pull = usePullToRefresh(upNext.refetch, imports.refetch, pantry.refetch, coverage.refetch);

  const openRecipe = (id: string) => router.push({ pathname: '/recipe/[id]', params: { id } });
  const idea = ideas.length > 0 ? ideas[ideaIndex % ideas.length] : undefined;
  const entries = upNext.data ?? [];

  const planIdea = (i: IdeaView) =>
    plan.mutate(
      { recipeId: i.recipeId },
      {
        onSuccess: ({ upNextId, items }) => {
          haptics.add();
          toast.show({
            message: items > 0 ? `Added to Up next · ${plural(items, 'item', 'items')} on your list` : 'Added to Up next',
            action: { label: 'Undo', onPress: () => unplan.mutate(upNextId) },
          });
        },
        onError: (e) => toast.show({ message: friendlyError(e, "Couldn't plan it. Try again.") }),
      },
    );

  return (
    <Screen tabBar refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <Stack gap="lg">
        <LargeTitle
          overline={formatOverlineDate(new Date())}
          overlineAccessory={
            <AvatarGroup names={people.names} onPress={() => router.push('/settings')} accessibilityLabel="Household and settings" />
          }
          title="What's for dinner?"
        />
        <FieldButton
          icon="add"
          title="Add to groceries"
          subtitle={toBuy > 0 ? `${plural(toBuy, 'item', 'items')} on the list` : 'Nothing on the list yet'}
          action="Open"
          accessibilityHint="Opens Groceries, ready to type"
          onPress={() => router.navigate({ pathname: '/groceries', params: { add: String(Date.now()) } })}
        />
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

      <ImportList items={imports.items} onRetry={imports.retry} onRemove={imports.remove} retryingId={imports.retryingId} />

      {pantry.useSoon.length > 0 ? (
        <Stack gap="md">
          <SectionHeader
            title="Use soon"
            subtitle="Tap one to see what you can cook with it"
            action={{ label: 'Pantry', onPress: () => router.navigate('/pantry') }}
          />
          <Rail accessibilityLabel="Use soon">
            {pantry.useSoon.map((item) => (
              <UseSoonCard
                key={item.key}
                name={item.name}
                category={item.category}
                when={item.when}
                urgent={item.urgent}
                freshness={item.freshness}
                onPress={() => router.navigate({ pathname: '/recipes', params: { uses: item.productId, usesName: item.name } })}
              />
            ))}
          </Rail>
        </Stack>
      ) : null}

      <Stack gap="md">
        <SectionHeader title="Up next" meta={entries.length > 0 ? plural(entries.length, 'recipe', 'recipes') : undefined} />
        {upNext.isLoading ? (
          <ListSkeleton rows={2} />
        ) : upNext.isError && !upNext.data ? (
          <ErrorState onRetry={() => void upNext.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="cook"
            title="Nothing planned yet"
            text="Open a recipe and tap Plan it. What's missing lands on your list."
            action={{ label: 'Browse recipes', onPress: () => router.navigate('/recipes') }}
          />
        ) : (
          <Rail accessibilityLabel="Up next">
            {entries.map((entry) => {
              const tile = upNextTileData(entry, coverage.byRecipe.get(entry.recipe_id));
              return (
                <UpNextTile
                  key={entry.id}
                  {...tile}
                  onPress={() => openRecipe(entry.recipe_id)}
                  onLongPress={() => {
                    haptics.select();
                    setRemoving(entry);
                  }}
                />
              );
            })}
          </Rail>
        )}
      </Stack>

      <ConfirmSheet
        visible={removing !== null}
        title="Remove from Up next?"
        text="Items that only this recipe added leave your list."
        confirmLabel="Remove"
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
