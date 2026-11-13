import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import {
  TIP,
  creatorTargetFromText,
  dismissTip,
  friendlyError,
  importItemView,
  importRoute,
  importWaitLine,
  markImportSeen,
  screenshotCount,
  useAskSheets,
  useAskSheetsOutlet,
  useCreateImport,
  useImportJob,
  useImportRecovery,
  useIncomingShare,
  usePushPermission,
  type CreatorTarget,
  type ImportInput,
  type IncomingShare,
} from '@/data';
import {
  Banner,
  Button,
  CreatorSheet,
  EmptyState,
  FieldButton,
  InlineNote,
  RecipeCover,
  Screen,
  Stack,
  StageProgress,
  Text,
  ModalBar,
  UseItUpSheet,
  haptics,
  openAfterModal,
  useToast,
} from '@/ds';

export default function ImportScreen() {
  const { share, clear } = useIncomingShare();
  // A channel or playlist: pick from the creator's latest recipes instead of saving the link.
  const creator = share?.url ? creatorTargetFromText(share.url) : null;
  return creator && share?.url ? (
    <CreatorShare link={share.url} target={creator} clear={clear} />
  ) : (
    <RecipeShare share={share} clear={clear} />
  );
}

/**
 * A shared channel or playlist: the app's creator sheet, drawn over this modal screen (it can't come up
 * from the app root over a modal); closing it leaves. Listing goes on if they leave before it's done.
 */
function CreatorShare({ link, target, clear }: { link: string; target: CreatorTarget; clear: () => void }) {
  const router = useRouter();
  // Registered before the sheet opens below: it comes up here, not at the root.
  const drawn = useAskSheetsOutlet();
  const sheets = useAskSheets();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/recipes');
    clear();
  };
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (opened.current === link) return;
    opened.current = link;
    dismissTip(TIP.shareHowTo);
    sheets.openCreator(target, { onClose: close });
  }, [link, target, sheets]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen modal header={<ModalBar onClose={close} />}>
      {drawn ? (
        <>
          <CreatorSheet {...drawn.creator} />
          <UseItUpSheet {...drawn.ideas} />
        </>
      ) : null}
    </Screen>
  );
}

/** A shared video, page, text or screenshots: saved right away, with its progress. */
function RecipeShare({ share, clear }: { share: IncomingShare | null; clear: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateImport();
  const push = usePushPermission();
  const [jobId, setJobId] = useState<string | null>(null);
  const tracked = useImportJob(jobId);
  const recovery = useImportRecovery((message, notice) => toast.show({ message, ...notice }), (job) => setJobId(job.id));
  const started = useRef<string | null>(null);
  const openedAt = useRef(Date.now());

  const shots = share?.images.length ?? 0;
  const input: ImportInput | null = share
    ? shots > 0
      ? { images: share.images }
      : share.url
        ? { url: share.url, text: share.text, title: share.title }
        : { text: share.text ?? '' }
    : null;
  const shareKey = share ? (share.images.map((i) => i.uri).join('|') || share.url || share.text || '') : null;

  const start = (what: ImportInput) =>
    create.mutate(what, {
      onSuccess: (job) => {
        setJobId(job.id);
        haptics.add();
      },
    });

  // Sharing is the intent: the import starts right away, once per shared item.
  useEffect(() => {
    if (!input || !shareKey || started.current === shareKey) return;
    started.current = shareKey;
    dismissTip(TIP.shareHowTo);
    start(input);
  }, [input, shareKey, start]);

  // The job right after creation, before the list has it.
  const job = tracked ?? (create.data && create.data.id === jobId ? create.data : null);
  const view = job ? importItemView(job) : null;

  const readyOnce = useRef<string | null>(null);
  useEffect(() => {
    if (view?.state !== 'ready' || readyOnce.current === view.id) return;
    readyOnce.current = view.id;
    haptics.success();
  }, [view?.state, view?.id]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/recipes');
    clear();
  };
  const openResult = () => {
    if (!view) return;
    markImportSeen(view.id);
    close();
    const recipeId = view.recipeId;
    if (view.proposalId) router.navigate('/pantry');
    else if (recipeId) openAfterModal(() => router.push({ pathname: '/recipe/[id]', params: { id: recipeId } }));
  };
  // Like every sheet: the × at the top right.
  const header = <ModalBar onClose={close} />;

  if (!share || !input) {
    return (
      <Screen modal header={header}>
        <EmptyState
          icon="share"
          title="Nothing to save"
          text="In Instagram, TikTok, YouTube, Safari or Photos, tap Share and pick Save to Mesa."
          action={{ label: 'Close', onPress: close }}
        />
      </Screen>
    );
  }

  const app = share.url ? (importRoute({ input_url: share.url, input_image_path: null }) === 'web' ? 'Safari' : 'the video') : 'your photos';
  const ready = view?.state === 'ready';
  const failed = view?.state === 'failed';
  // The ways out of a failed import, best first (leaving is Done).
  const ways = failed && job ? view.recovery.filter((a) => a.kind !== 'remove').map((a) => ({ ...a, run: () => recovery.run(job, a.kind) })) : [];
  // Every way forward is in the footer, the main one first and full width; the body only explains.
  const footer = ready ? (
    <Stack gap="sm">
      <Button label={view.proposalId ? 'Review in Pantry' : 'Open recipe'} size="lg" fullWidth onPress={openResult} />
      <Button label="Done" variant="ghost" fullWidth onPress={close} />
    </Stack>
  ) : create.isError ? (
    <Stack gap="sm">
      <Button label="Try again" size="lg" fullWidth iconStart="retry" loading={create.isPending} onPress={() => start(input)} />
      <Button label="Done" variant="ghost" fullWidth onPress={close} />
    </Stack>
  ) : ways.length > 0 ? (
    <Stack gap="sm">
      {ways.map((a, i) => (
        <Button key={a.kind} label={a.label} size={i === 0 ? 'lg' : 'md'} variant={i === 0 ? 'primary' : 'ghost'} fullWidth onPress={a.run} />
      ))}
      <Button label="Done" variant="ghost" fullWidth onPress={close} />
    </Stack>
  ) : (
    <Button label="Done" variant={failed ? 'primary' : 'secondary'} size="lg" fullWidth onPress={close} />
  );

  const heading = (() => {
    if (create.isError) return { title: "Couldn't save it", text: 'Nothing was sent. Try again, or send a screenshot instead.' };
    if (create.isPaused) return { title: 'Waiting for a connection', text: "Keep Mesa open: it sends this as soon as you're back online." };
    if (!view) {
      return { title: 'Saving…', text: shots > 1 ? `Uploading ${shots} screenshots.` : shots === 1 ? 'Uploading your screenshot.' : 'Sending it to Mesa.' };
    }
    if (ready) {
      if (view.proposalId) return { title: 'That was a receipt', text: 'Mesa read it as a receipt. Check what goes in the pantry.' };
      return { title: view.title, text: job?.already_saved ? 'Already in your Recipes: nothing new to save.' : 'Ready in Recipes.' };
    }
    if (failed) return { title: "Couldn't save this recipe", text: view.caption };
    return { title: 'Saving…', text: importWaitLine(importRoute(job!), screenshotCount(job!)) };
  })();

  const cover = view?.thumbnailUri ?? share.images[0]?.uri ?? null;
  return (
    <Screen modal header={header} gap="xxl" footer={footer}>
      <Stack gap="sm">
        <Text variant="title">{heading.title}</Text>
        <Text variant="body" color="inkMuted">
          {heading.text}
        </Text>
      </Stack>

      {cover ? <RecipeCover uri={cover} shape="card" seed={view?.recipeId ?? undefined} accessibilityLabel={view?.title ?? 'Shared screenshot'} /> : null}

      {create.isError ? <Banner tone="danger" text={friendlyError(create.error, "Couldn't start saving. Try again.")} /> : null}

      {!view && !create.isError ? (
        <StageProgress label={create.isPaused ? 'Offline' : 'Sending'} from={0} to={0.05} expectedMs={3000} since={openedAt.current} />
      ) : null}

      {view?.state === 'working' && view.progress ? (
        <Stack gap="lg">
          <StageProgress {...view.progress} />
          {push.permission === 'undecided' ? (
            <FieldButton icon="bell" title="Tell me when it's ready" subtitle={`So you can go back to ${app}`} onPress={push.ask} />
          ) : (
            <InlineNote
              icon={push.permission === 'granted' ? 'bell' : 'info'}
              text={
                push.permission === 'granted'
                  ? `You can go back to ${app}. Mesa lets you know when it's ready.`
                  : `You can go back to ${app}. It will be in Recipes when it's ready.`
              }
            />
          )}
        </Stack>
      ) : null}
    </Screen>
  );
}
