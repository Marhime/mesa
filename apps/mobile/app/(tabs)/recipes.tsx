import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  friendlyError,
  importInputFromText,
  pickImage,
  readClipboardUrl,
  recipeImageUrl,
  recipeMeta,
  useCreateImport,
  useImportsPanel,
  usePullToRefresh,
  useRecipeSearch,
  type ImportInput,
} from '@/data';
import {
  AddRecipeSheet,
  CardGrid,
  CardGridSkeleton,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  ImportList,
  LargeTitle,
  RecipeCard,
  Screen,
  Stack,
  TextField,
  duration,
  useToast,
} from '@/ds';

export default function RecipesScreen() {
  const router = useRouter();
  // From a Use soon card: only the recipes that use this product.
  const { uses, usesName } = useLocalSearchParams<{ uses?: string; usesName?: string }>();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const recipes = useRecipeSearch(search, favorites, uses ?? null);
  const clearUses = () => router.setParams({ uses: undefined, usesName: undefined });
  const imports = useImportsPanel();
  const create = useCreateImport();
  const pull = usePullToRefresh(recipes.refetch, imports.refetch);

  const openAdd = () => {
    setSheetError(null);
    setAdding(true);
  };

  // From the sheet, errors show inside it: a toast would sit behind the sheet's modal.
  const startImport = (input: ImportInput, fromSheet: boolean) => {
    setSheetError(null);
    create.mutate(input, {
      onSuccess: () => {
        setAdding(false);
        toast.show({ message: "Added — we're preparing your recipe" });
      },
      onError: (e) => {
        const message = friendlyError(e, "Couldn't start the import. Try again.");
        if (fromSheet) setSheetError(message);
        else toast.show({ message });
      },
    });
  };

  const fromScreenshot = () => {
    setAdding(false);
    // Let the sheet slide away before the photo picker comes up.
    setTimeout(() => {
      pickImage()
        .then((image) => {
          if (!image) return;
          toast.show({ message: 'Uploading your screenshot…' });
          startImport({ image }, false);
        })
        .catch((e: unknown) => toast.show({ message: friendlyError(e, "Couldn't open your photos.") }));
    }, duration.sheet);
  };

  const filtered = search.trim().length > 0 || favorites || !!uses;
  return (
    <Screen tabBar refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <Stack gap="lg">
        <LargeTitle
          title="Recipes"
          action={<IconButton icon="add" variant="ink" accessibilityLabel="Add recipe" onPress={openAdd} />}
        />
        <TextField label="Search recipes" icon="search" value={search} onChangeText={setSearch} clearable returnKeyType="search" />
        <ChipRow accessibilityLabel="Filter">
          {uses ? (
            <Chip
              label={`Uses ${(usesName ?? 'it').toLowerCase()}`}
              icon="close"
              selected
              accessibilityLabel={`Showing recipes that use ${usesName ?? 'it'}. Remove this filter`}
              onPress={clearUses}
            />
          ) : null}
          <Chip label="All" selected={!favorites && !uses} onPress={() => setFavorites(false)} />
          <Chip label="Favorites" icon="favorite" selected={favorites} onPress={() => setFavorites(true)} />
        </ChipRow>
      </Stack>

      <ImportList items={imports.items} onRetry={imports.retry} onRemove={imports.remove} retryingId={imports.retryingId} />

      {recipes.isLoading ? (
        <CardGridSkeleton />
      ) : recipes.isError && !recipes.data ? (
        <ErrorState onRetry={() => void recipes.refetch()} />
      ) : recipes.results.length === 0 ? (
        filtered ? (
          <EmptyState
            icon="search"
            title="No matches"
            text={
              uses
                ? `No recipe uses ${(usesName ?? 'it').toLowerCase()} yet.`
                : favorites
                  ? 'Tap the heart on a recipe to keep it here.'
                  : 'Try another word.'
            }
            action={{
              label: 'Show all recipes',
              onPress: () => {
                setSearch('');
                setFavorites(false);
                clearUses();
              },
            }}
          />
        ) : (
          <EmptyState
            icon="recipes"
            title="No recipes yet"
            text="Share a video or a link to Mesa from any app, or add one here."
            action={{ label: 'Add recipe', onPress: openAdd }}
          />
        )
      ) : (
        <CardGrid>
          {recipes.results.map((r) => (
            <RecipeCard
              key={r.id}
              title={r.title}
              imageUrl={recipeImageUrl(r.image_path)}
              seed={r.id}
              meta={recipeMeta(r)}
              favorite={r.is_favorite}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}
            />
          ))}
        </CardGrid>
      )}

      <AddRecipeSheet
        visible={adding}
        onClose={() => setAdding(false)}
        readClipboardUrl={readClipboardUrl}
        onSubmitLink={(text) => startImport(importInputFromText(text), true)}
        onScreenshot={fromScreenshot}
        onWrite={() => {
          setAdding(false);
          router.push('/editor');
        }}
        busy={create.isPending}
        error={sheetError}
      />
    </Screen>
  );
}
