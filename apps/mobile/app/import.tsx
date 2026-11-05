import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { friendlyError, importReading, useCreateImport, useIncomingShare, type ImportInput } from '@/data';
import { Banner, Button, EmptyState, InlineNote, ProgressNote, RecipeCover, Screen, Stack, Text, TopBar } from '@/ds';

export default function ImportRecipeScreen() {
  const router = useRouter();
  const { share, clear } = useIncomingShare();
  const create = useCreateImport();
  const started = useRef<string | null>(null);

  const input: ImportInput | null = share
    ? share.image
      ? { image: share.image }
      : share.url
        ? { url: share.url }
        : { text: share.text ?? '' }
    : null;
  const shareKey = share ? (share.image?.uri ?? share.url ?? share.text ?? '') : null;

  // Sharing is the intent: the import starts right away, once per shared item.
  useEffect(() => {
    if (!input || !shareKey || started.current === shareKey) return;
    started.current = shareKey;
    create.mutate(input);
  }, [input, shareKey, create]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/recipes');
    clear();
  };
  const header = <TopBar backIcon="close" backLabel="Close" onBack={close} />;

  if (!share || !input) {
    return (
      <Screen header={header}>
        <EmptyState
          icon="share"
          title="Nothing to import"
          text="In Instagram, TikTok, YouTube, Safari or Photos, tap Share and pick Save to Mesa."
          action={{ label: 'Close', onPress: close }}
        />
      </Screen>
    );
  }

  const failed = create.isError;
  return (
    <Screen header={header} gap="xxl" footer={<Button label="Done" size="lg" fullWidth onPress={close} />}>
      <Stack gap="sm">
        <Text variant="title">{failed ? "Couldn't add it" : 'Added to Recipes'}</Text>
        <Text variant="body" color="inkMuted">
          {failed
            ? 'Nothing was imported. Try again, or send a screenshot instead.'
            : share.url
              ? 'Go back to your video. The recipe will be in Recipes in a few seconds.'
              : 'The recipe will be in Recipes in a few seconds.'}
        </Text>
      </Stack>
      {share.image ? <RecipeCover uri={share.image.uri} shape="card" accessibilityLabel="Shared screenshot" /> : null}
      {failed ? (
        <Stack gap="md">
          <Banner tone="danger" text={friendlyError(create.error, "Couldn't start the import. Try again.")} />
          <Button label="Try again" variant="secondary" loading={create.isPending} onPress={() => create.mutate(input)} />
        </Stack>
      ) : (
        <Stack gap="lg">
          <ProgressNote text={importReading(input)} />
          <InlineNote text="If we can't read it, we'll let you know and you can send a screenshot instead." />
        </Stack>
      )}
    </Screen>
  );
}
