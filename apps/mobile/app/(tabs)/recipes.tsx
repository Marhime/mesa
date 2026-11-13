import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  creatorTargetFromText,
  friendlyError,
  importInputFromText,
  pickImages,
  readClipboardUrl,
  recipeImageUrl,
  recipeMeta,
  TIP,
  useAskSheets,
  useCreateImport,
  useCreatorRail,
  useForYou,
  useImportsPanel,
  useNewFromCreators,
  usePullToRefresh,
  useRecipeSearch,
  useTip,
  type ImportInput,
} from '@/data';
import {
  AddRecipeSheet,
  CardGrid,
  CardGridSkeleton,
  Chip,
  ChipRow,
  CreatorNewsRail,
  CreatorRail,
  EmptyState,
  ErrorState,
  ForYouRail,
  IconButton,
  ImportList,
  LargeTitle,
  RecipeCard,
  Screen,
  Stack,
  TextField,
  TipCard,
  duration,
  haptics,
  useToast,
} from '@/ds';

export default function RecipesScreen() {
  const router = useRouter();
  // From a Use soon card: only the recipes that use this product.
  const { uses, usesName, add } = useLocalSearchParams<{ uses?: string; usesName?: string; add?: string }>();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const recipes = useRecipeSearch(search, favorites, uses ?? null);
  const clearUses = () => router.setParams({ uses: undefined, usesName: undefined });
  const imports = useImportsPanel({
    notify: (message, notice) => toast.show({ message, ...notice }),
    openRecipe: (id) => router.push({ pathname: '/recipe/[id]', params: { id } }),
    openPantry: () => router.navigate('/pantry'),
  });
  const create = useCreateImport();
  // Until the first share: the fastest way to save is from the app the video is in.
  const howTo = useTip(TIP.shareHowTo);
  // A creator's latest videos open in the app's creator sheet; Ask Mesa in its own.
  const sheets = useAskSheets();
  const rail = useCreatorRail(sheets.openCreator);
  // Their new recipe videos: Save (an import, its row shows above), Watch, Not now.
  const news = useNewFromCreators({ onError: (message) => toast.show({ message, tone: 'error' }) });
  // Real recipe videos Mesa picked this week: Save (an import, its row shows below), Watch, Not for us.
  const forYou = useForYou({
    onError: (message) => toast.show({ message, tone: 'error' }),
    onDismissed: () => toast.show({ message: 'Fewer like this' }),
  });
  const pull = usePullToRefresh(recipes.refetch, imports.refetch, forYou.refetch);

  const openAdd = () => {
    setSheetError(null);
    setAdding(true);
  };

  // "Add a recipe" from Home's + opens the sheet once per request.
  useEffect(() => {
    if (!add) return;
    setSheetError(null);
    setAdding(true);
  }, [add]);

  // From the sheet, errors show inside it: a toast would sit behind the sheet's modal.
  const startImport = (input: ImportInput, fromSheet: boolean) => {
    setSheetError(null);
    create.mutate(input, {
      // The "Saving" row with its progression appears right away: no toast on top of it. The add haptic came
      // with the tap (the sheet's Save) or the pick (screenshots).
      onSuccess: () => setAdding(false),
      onError: (e) => {
        const message = friendlyError(e, "Couldn't start the import. Try again.");
        if (fromSheet) setSheetError(message);
        else toast.show({ message, tone: 'error' });
      },
    });
  };

  // A channel or playlist link opens its creator's videos instead of a recipe import.
  const submitLink = (text: string) => {
    const creator = creatorTargetFromText(text);
    if (!creator) return startImport(importInputFromText(text), true);
    setAdding(false);
    // Let the add sheet slide away before the creator's comes up.
    setTimeout(() => sheets.openCreator(creator), duration.sheet);
  };

  const fromScreenshot = () => {
    setAdding(false);
    // Let the sheet slide away before the photo picker comes up.
    setTimeout(() => {
      pickImages()
        .then((images) => {
          if (images.length === 0) return;
          haptics.add();
          toast.show({ message: images.length > 1 ? `Uploading ${images.length} screenshots…` : 'Uploading your screenshot…' });
          startImport({ images }, false);
        })
        .catch((e: unknown) => toast.show({ message: friendlyError(e, "Couldn't open your photos."), tone: 'error' }));
    }, duration.sheet);
  };

  // Searching (or from a Use soon card) shows only matching recipes; the Favorites chip filters below itself.
  const searching = search.trim().length > 0 || !!uses;
  const filtered = searching || favorites;
  return (
    <Screen tabBar refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <Stack gap="lg">
        <LargeTitle
          title="Recipes"
          action={<IconButton icon="add" variant="ink" accessibilityLabel="Add recipe" onPress={openAdd} />}
        />
        <TextField label="Search recipes" icon="search" value={search} onChangeText={setSearch} clearable returnKeyType="search" />
      </Stack>

      {howTo.visible ? (
        <TipCard
          icon="share"
          title="Save recipes from Instagram or TikTok"
          steps={[
            'On the post, tap Share, then Share to… or More.',
            'Pick Save to Mesa. First time: tap More at the end of the app row and add it.',
            'Go back to scrolling. Mesa writes the recipe down for you.',
          ]}
          onDismiss={howTo.dismiss}
        />
      ) : null}

      {searching ? null : (
        <ForYouRail
          videos={forYou.videos}
          note={forYou.firstLook ? 'Your first suggestions arrive on Monday.' : null}
          savingKey={forYou.savingKey}
          onSave={forYou.onSave}
          onWatch={forYou.onWatch}
          onDismiss={forYou.onDismiss}
        />
      )}

      {searching ? null : <CreatorRail creators={rail.creators} onOpen={rail.onOpen} />}

      <ImportList title={imports.title} rows={imports.rows} />

      {searching ? null : (
        <CreatorNewsRail
          videos={news.videos}
          savingKey={news.savingKey}
          onSave={news.onSave}
          onWatch={news.onWatch}
          onDismiss={news.onDismiss}
        />
      )}

      <Stack gap="lg">
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
              text="Paste a link, pick a screenshot or write one here."
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
      </Stack>

      <AddRecipeSheet
        visible={adding}
        onClose={() => setAdding(false)}
        readClipboardUrl={readClipboardUrl}
        onSubmitLink={submitLink}
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
