import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  KEEPS_OPTIONS,
  PANTRY_LEVELS,
  friendlyError,
  keepsDaysFrom,
  pantryAmount,
  pantryDateLine,
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
  usePullToRefresh,
  useRecipeCoverage,
  useResolveGroceryText,
  useScanReview,
  useStaples,
  type PantryEntry,
  type Zone,
} from '@/data';
import {
  AddPantrySheet,
  Button,
  CardGrid,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FoodRow,
  IconButton,
  InlineNote,
  LargeTitle,
  ListGroup,
  ListRow,
  PantryItemSheet,
  PantryTile,
  ProposalSheet,
  Rail,
  ScanInbox,
  Screen,
  SectionHeader,
  SegmentedControl,
  Stack,
  StaplesSheet,
  Tag,
  Text,
  TextField,
  UseSoonCard,
  duration,
  haptics,
  useToast,
} from '@/ds';

const ZONES: { value: Zone; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'cupboard', label: 'Cupboard' },
];

export default function PantryScreen() {
  const router = useRouter();
  const { stock } = useLocalSearchParams<{ stock?: string }>();
  const toast = useToast();
  const pantry = usePantry();
  const updated = usePantryUpdated();
  const coverage = useRecipeCoverage();
  const staples = useStaples();
  const catalog = useCatalogIndex();
  const { add } = useAddGroceries();
  const resolve = useResolveGroceryText();
  const notify = (message: string, action?: { label: string; onPress: () => void }) => toast.show({ message, action });
  const actions = usePantryActions(notify);
  const stocking = usePantryStocking((e) => notify(friendlyError(e, "Couldn't add that. Try again.")));
  const [zone, setZone] = useState<Zone>('fridge');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [staplesOpen, setStaplesOpen] = useState(false);
  const review = useScanReview((message) => notify(message));
  // The camera can't open over a sheet: let it slide away first.
  const scanAfterSheet = (kind: 'sweep' | 'receipt') => {
    stocking.close();
    setTimeout(() => review.scan(kind, zone), duration.sheet);
  };
  const found = usePantrySearch(search, pantry.items);
  const pull = usePullToRefresh(pantry.refetch, coverage.refetch, staples.refetch);

  // "Stock your pantry" from Home opens the sheet once per request.
  const { start } = stocking;
  useEffect(() => {
    if (stock) start();
  }, [stock, start]);

  const q = search.trim();
  const shown = q ? found.results : pantry.inZone(zone);
  const ideas = [...coverage.byRecipe.values()].filter((c) => c.soon_names.length > 0).length;
  const open: PantryEntry | undefined = pantry.all.find((e) => e.id === openId);
  const stapleItems = staples.data ?? [];

  const confirmStock = () =>
    void stocking.confirm().then((n) => {
      if (n > 0) {
        haptics.success();
        notify(`${plural(n, 'thing', 'things')} in your pantry. Ideas just got better.`);
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
        <TextField label="Search the pantry" placeholder="Do we have…?" icon="search" value={search} onChangeText={setSearch} clearable returnKeyType="search" />
      </Stack>

      <ScanInbox {...review.inbox} />

      {pantry.isLoading ? (
        <CardGridSkeleton />
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
        shown.length > 0 ? (
          <PantryGrid items={shown} onOpen={setOpenId} />
        ) : (
          <Stack gap="sm" align="center">
            <EmptyState
              icon="search"
              title={`No ${q} at home`}
              text={found.product ? `Mesa knows it as ${found.product.name_en.toLowerCase()}.` : undefined}
              action={{
                label: 'Add to groceries',
                onPress: () => {
                  haptics.add();
                  add(resolve(q), 'manual', (e) => notify(friendlyError(e, "Couldn't add that. Try again.")));
                  notify(`Added ${q} to groceries`);
                  setSearch('');
                },
              }}
            />
            {found.product ? (
              <Button
                label="I have it"
                variant="ghost"
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
          {pantry.stale.length > 0 ? (
            <Stack gap="md">
              <SectionHeader title="Still there?" subtitle="Past their date. Tap one to keep it or let it go." />
              <ListGroup inset="none">
                {pantry.stale.map((e) => (
                  <FoodRow
                    key={e.id}
                    category={e.category}
                    title={e.name}
                    detail={pantryDateLine(e)}
                    onPress={() => setOpenId(e.id)}
                    trailing={<Tag label="Check" variant="outline" />}
                  />
                ))}
              </ListGroup>
            </Stack>
          ) : null}

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

          <Stack gap="lg">
            <SegmentedControl options={ZONES} value={zone} onChange={setZone} accessibilityLabel="Zone" />
            {shown.length > 0 ? (
              <PantryGrid items={shown} onOpen={setOpenId} />
            ) : (
              <Text variant="body" color="inkMuted" align="center">
                {`Nothing in the ${ZONES.find((z) => z.value === zone)!.label.toLowerCase()}.`}
              </Text>
            )}
            {zone === 'cupboard' && stapleItems.length > 0 ? (
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
        addCount={stocking.addCount}
        onConfirm={confirmStock}
        loading={stocking.pending}
        scan={{
          sweepLabel: `Film the ${ZONES.find((z) => z.value === zone)!.label.toLowerCase()}`,
          onSweep: () => scanAfterSheet('sweep'),
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
                name: open.name,
                category: open.category,
                description: `${pantryAmount(open).text} · ${pantryDateLine(open)}`,
                stale: open.state === 'check' || open.state === 'gone',
                level: open.level ?? 'full',
                zone: open.zone,
                keepsDays: keepsDaysFrom(open.expires_on),
                keepsHint: pantryDateLine(open),
              }
            : null
        }
        levels={PANTRY_LEVELS}
        keepsOptions={KEEPS_OPTIONS}
        onLevel={(level) => {
          if (!open) return;
          actions.setLevel(open, level);
          if (level === 'out') setOpenId(null);
        }}
        onZone={(z) => open && actions.setZone(open, z)}
        onKeeps={(days) => open && actions.setKeeps(open, days)}
        onStillGood={() => {
          if (open) actions.stillGood(open);
          setOpenId(null);
        }}
        onGone={() => {
          if (open) actions.gone(open);
          setOpenId(null);
        }}
        onAddToList={() => {
          if (open) actions.addToList(open);
          setOpenId(null);
        }}
      />

      <StaplesSheet
        visible={staplesOpen}
        onClose={() => setStaplesOpen(false)}
        items={stapleItems.map((s) => ({ key: s.productId, name: s.name, category: s.category, isOut: s.isOut }))}
        onOut={(key) => actions.staple.out(key, stapleItems.find((s) => s.productId === key)?.name ?? 'It')}
        onBack={(key) => actions.staple.back(key)}
      />
    </Screen>
  );
}

function PantryGrid({ items, onOpen }: { items: PantryEntry[]; onOpen: (id: string) => void }) {
  return (
    <CardGrid density="tight">
      {items.map((e) => {
        const amount = pantryAmount(e);
        return (
          <PantryTile
            key={e.id}
            name={e.name}
            category={e.category}
            amount={amount.text}
            low={amount.low}
            quarters={amount.quarters}
            onPress={() => onOpen(e.id)}
          />
        );
      })}
    </CardGrid>
  );
}
