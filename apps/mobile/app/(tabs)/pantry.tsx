import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  KEEPS_OPTIONS,
  PANTRY_LEVELS,
  friendlyError,
  keepsDaysFrom,
  pantryDateLine,
  pantryEditAmount,
  pantrySections,
  pantrySummary,
  plural,
  staplesLine,
  useAddGroceries,
  useCatalogIndex,
  usePantry,
  usePantryActions,
  usePantrySearch,
  usePantryStocking,
  usePantryUpdated,
  usePictoLookup,
  usePullToRefresh,
  useRecipeCoverage,
  useAskSheets,
  useResolveGroceryText,
  useScanReview,
  useSyncLine,
  useStaples,
  type Notify,
  type PantryEntry,
  type Zone,
} from '@/data';
import {
  AddPantrySheet,
  Button,
  EmptyState,
  ErrorState,
  FoodRow,
  IconButton,
  InlineNote,
  LargeTitle,
  ListGroup,
  ListRow,
  ListSkeleton,
  PantryItemSheet,
  PantryList,
  ProposalSheet,
  Rail,
  Reveal,
  ScanInbox,
  Screen,
  SectionHeader,
  Stack,
  StaplesSheet,
  Tag,
  TextField,
  UseSoonCard,
  duration,
  haptics,
  useToast,
} from '@/ds';

// A scan still needs to know what it is looking at.
const SWEEPS: { value: Zone; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'cupboard', label: 'Cupboard' },
];

export default function PantryScreen() {
  const router = useRouter();
  const { stock, review: reviewId } = useLocalSearchParams<{ stock?: string; review?: string }>();
  const toast = useToast();
  const pantry = usePantry();
  const updated = usePantryUpdated();
  const coverage = useRecipeCoverage();
  const staples = useStaples();
  const catalog = useCatalogIndex();
  const { add } = useAddGroceries();
  const resolve = useResolveGroceryText();
  const notify: Notify = (message, notice) => toast.show({ message, ...notice });
  const actions = usePantryActions(notify);
  const stocking = usePantryStocking((e) => notify(friendlyError(e, "Couldn't add that. Try again."), { tone: 'error' }));
  const pictoFor = usePictoLookup();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [staplesOpen, setStaplesOpen] = useState(false);
  const review = useScanReview(notify);
  const sync = useSyncLine();
  // A Use soon card asks for dishes that use it (the app's ideas sheet); its own recipes stay one tap away.
  const sheets = useAskSheets();
  // The camera can't open over a sheet: let it slide away first.
  const scanAfterSheet = (kind: 'sweep' | 'receipt', zone?: Zone) => {
    stocking.close();
    setTimeout(() => review.scan(kind, zone), duration.sheet);
  };
  const found = usePantrySearch(search, pantry.items);
  const pull = usePullToRefresh(pantry.refetch, coverage.refetch, staples.refetch);

  // "Stock your pantry" from Home opens the sheet once per request (the request is then cleared).
  const { start } = stocking;
  useEffect(() => {
    if (!stock) return;
    start();
    router.setParams({ stock: undefined });
  }, [stock, start, router]);

  // A tapped "scan ready" notification (or toast) opens that review.
  const { openReview } = review;
  useEffect(() => {
    if (reviewId) openReview(reviewId);
  }, [reviewId, openReview]);

  const q = search.trim();
  const sections = pantrySections(q ? found.results : pantry.atHome);
  const ideas = [...coverage.byRecipe.values()].filter((c) => c.soon_names.length > 0).length;
  const open: PantryEntry | undefined = pantry.all.find((e) => e.id === openId);
  const stapleItems = staples.data ?? [];

  const firstRun = stocking.firstRun;
  const confirmStock = () =>
    void stocking.confirm().then((n) => {
      if (n === null) return;
      if (n > 0) {
        haptics.success();
        notify(`${plural(n, 'thing', 'things')} in your pantry. Ideas just got better.`);
      } else if (firstRun) {
        notify('Basics saved. Add fresh things anytime.');
      }
    });

  return (
    <Screen tabBar refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <Stack gap="lg">
        <LargeTitle
          overline={pantry.data ? pantrySummary(pantry.items.length, updated) : undefined}
          title="Pantry"
          action={<IconButton icon="add" variant="ink" accessibilityLabel="Add to pantry" onPress={stocking.start} />}
        />
        {sync ? <InlineNote icon="offline" text={sync} /> : null}
        <TextField label="Search the pantry" placeholder="Do we have…?" icon="search" value={search} onChangeText={setSearch} clearable returnKeyType="search" />
      </Stack>

      <ScanInbox {...review.inbox} />

      {pantry.isLoading ? (
        <ListSkeleton rows={6} leading="picto" />
      ) : pantry.isError && !pantry.data ? (
        <ErrorState onRetry={() => void pantry.refetch()} />
      ) : pantry.all.length === 0 ? (
        <Stack gap="md">
          <EmptyState
            icon="list"
            title="What's already at home?"
            text="Tick what you have, so ideas and your list are right from day one."
            action={{ label: 'Stock your pantry', onPress: stocking.start, variant: 'primary' }}
          />
          <InlineNote text="Or skip it: what you buy lands here when you tap Done shopping." />
        </Stack>
      ) : q ? (
        sections.length > 0 ? (
          <PantryList sections={sections} onOpen={setOpenId} />
        ) : (
          <Stack gap="sm" align="center">
            <EmptyState
              icon="search"
              title={`No ${q} at home`}
              text={found.product ? `Also called ${found.product.name_en.toLowerCase()}.` : undefined}
              action={{
                label: 'Add to groceries',
                haptic: 'add',
                onPress: () => {
                  add(resolve(q), 'manual', (e) => notify(friendlyError(e, "Couldn't add that. Try again."), { tone: 'error' }));
                  notify(`Added ${q} to groceries`);
                  setSearch('');
                },
              }}
            />
            {found.product ? (
              <Button
                label="I have it"
                variant="ghost"
                haptic="check"
                onPress={() => {
                  actions.have(found.product!.id, found.product!.name_en);
                  setSearch('');
                }}
              />
            ) : null}
          </Stack>
        )
      ) : (
        <>
          <Reveal visible={pantry.stale.length > 0} motion="fade">
            <Stack gap="md">
              <SectionHeader title="Still there?" subtitle="Past their date. Tap one to keep it or let it go." />
              <ListGroup inset="picto">
                {pantry.stale.map((e) => (
                  <FoodRow
                    key={e.id}
                    picto={e.picto}
                    title={e.name}
                    detail={pantryDateLine(e)}
                    onPress={() => setOpenId(e.id)}
                    trailing={<Tag label="Check" variant="outline" />}
                  />
                ))}
              </ListGroup>
            </Stack>
          </Reveal>

          {pantry.useSoon.length > 0 ? (
            <Stack gap="md">
              <SectionHeader
                title="Use soon"
                action={ideas > 0 ? { label: plural(ideas, 'idea', 'ideas'), onPress: () => router.navigate('/') } : undefined}
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

          <Stack gap="lg">
            {sections.length > 0 ? (
              <PantryList sections={sections} onOpen={setOpenId} />
            ) : (
              <EmptyState size="section" title="Everything here is past its date" />
            )}
            {stapleItems.length > 0 ? (
              <ListGroup>
                <ListRow
                  title="Always at home"
                  subtitle={staplesLine(stapleItems)}
                  chevron
                  onPress={() => setStaplesOpen(true)}
                  accessibilityHint="Mark a staple as run out"
                />
              </ListGroup>
            ) : null}
          </Stack>
        </>
      )}

      <AddPantrySheet
        visible={stocking.open}
        onClose={stocking.close}
        firstRun={stocking.firstRun}
        catalog={catalog}
        onTyped={stocking.typed}
        justAdded={stocking.justAdded}
        groups={stocking.groups.map((g) => ({
          key: g.key,
          label: g.label,
          note: g.kind === 'staples' ? "Untick what you don't keep." : undefined,
          items: g.items.map((i) => ({ key: i.productId, name: i.name, category: i.category })),
        }))}
        selected={stocking.selected}
        onToggle={stocking.toggle}
        unsaved={stocking.changed}
        addCount={stocking.addCount}
        onConfirm={confirmStock}
        loading={stocking.pending}
        scan={{
          sweeps: SWEEPS.map((z) => ({ key: z.value, label: z.label, onPress: () => scanAfterSheet('sweep', z.value) })),
          onReceipt: () => scanAfterSheet('receipt'),
        }}
      />

      <ProposalSheet {...review.sheet} />

      <PantryItemSheet
        visible={open !== undefined}
        onClose={() => setOpenId(null)}
        item={
          open
            ? {
                id: open.id,
                name: open.name,
                picto: open.picto,
                description: pantryDateLine(open),
                stale: open.state === 'check' || open.state === 'gone',
                amount: pantryEditAmount(open),
                level: open.level ?? 'full',
                keepsDays: keepsDaysFrom(open.expires_on),
                keepsHint: pantryDateLine(open),
              }
            : null
        }
        // Out is not a level here: "Ran out" is the sheet's footer action.
        levels={PANTRY_LEVELS.filter((l) => l.value !== 'out')}
        keepsOptions={KEEPS_OPTIONS}
        onAmount={(amount) => open && actions.setAmount(open, amount)}
        onLevel={(level) => open && actions.setLevel(open, level)}
        onKeeps={(days) => open && actions.setKeeps(open, days)}
        onStillGood={() => {
          if (open) actions.stillGood(open);
          setOpenId(null);
        }}
        onGone={() => {
          if (open) actions.gone(open);
          setOpenId(null);
        }}
        onRanOut={() => {
          if (open) actions.setLevel(open, 'out');
          setOpenId(null);
        }}
      />

      <StaplesSheet
        visible={staplesOpen}
        onClose={() => setStaplesOpen(false)}
        items={stapleItems.map((s) => ({ key: s.productId, name: s.name, picto: pictoFor(s.productId, s.category), isOut: s.isOut }))}
        onOut={(key) => actions.staple.out(key, stapleItems.find((s) => s.productId === key)?.name ?? 'It')}
        onBack={(key) => actions.staple.back(key)}
      />
    </Screen>
  );
}
