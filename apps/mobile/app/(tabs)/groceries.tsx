import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  KEEPS_OPTIONS,
  friendlyError,
  plural,
  useAddGroceries,
  useCatalogIndex,
  useCompleteShopping,
  useDeleteItem,
  lineRecipes,
  useGroceries,
  useHouseholdPeople,
  useAlreadyHave,
  usePullToRefresh,
  usePutAway,
  useScanReview,
  useToggleItem,
  useUpdateItem,
  usePartnerArrivals,
  useSyncLine,
  useUsualProducts,
  usualToInput,
  toAddInputs,
  type GroceryLine,
  type Notify,
  type ResolvedGroceryItem,
} from '@/data';
import {
  AvatarGroup,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  GroceryEditSheet,
  GroceryList,
  InlineNote,
  LargeTitle,
  ListSkeleton,
  ProposalSheet,
  PutAwaySheet,
  QuickAddField,
  Reveal,
  ScanInbox,
  Screen,
  Stack,
  SuccessBurst,
  Text,
  duration,
  IconButton,
  haptics,
  useToast,
  useToastInset,
} from '@/ds';

export default function GroceriesScreen() {
  const { add: addParam } = useLocalSearchParams<{ add?: string }>();
  // The + (or Home's "Add to groceries"): the field comes back with the keyboard up.
  const [addTapped, setAddTapped] = useState<string | null>(null);
  const addRequest = addTapped ?? addParam;
  const toast = useToast();
  const notify: Notify = (message, notice) => toast.show({ message, ...notice });
  const people = useHouseholdPeople();
  const catalog = useCatalogIndex();
  // Live while on screen: read again as it comes back, and every few seconds.
  const focused = useIsFocused();
  const list = useGroceries({ live: focused });
  const { add } = useAddGroceries();
  const toggle = useToggleItem();
  // "Already have": the toast offers Undo.
  const markHave = useAlreadyHave(notify);
  const remove = useDeleteItem();
  const update = useUpdateItem(catalog);
  const complete = useCompleteShopping();
  const { picks } = useUsualProducts(catalog);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<{ text: string; onUndo: () => void } | null>(null);
  const sync = useSyncLine();
  // What the other phone adds flashes too, so you see it arrive.
  usePartnerArrivals(list.data?.map((l) => l.id), (ids) =>
    setFlash(new Set(list.lines.filter((l) => ids.includes(l.id)).map((l) => l.key))),
  );
  const [editing, setEditing] = useState<GroceryLine | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);
  // Done shopping emptied the list: the empty list celebrates instead of looking like day one.
  const [allPutAway, setAllPutAway] = useState(false);
  const putAway = usePutAway(list.inCart);
  const review = useScanReview(notify);

  useEffect(() => {
    if (flash.size === 0) return;
    const t = setTimeout(() => setFlash(new Set()), duration.flash);
    return () => clearTimeout(t);
  }, [flash]);

  const onError = (e: unknown) => toast.show({ message: friendlyError(e, "Couldn't save that. Try again."), tone: 'error' });
  const addAndFlash = (result: { keys: string[] }) => setFlash(new Set(result.keys));
  // Typed adds confirm under the field (the new row may be under the keyboard), with Undo.
  const addTyped = (items: ResolvedGroceryItem[]) => {
    const result = add(toAddInputs(items), 'manual', onError);
    addAndFlash(result);
    setAdded({
      text: result.message,
      onUndo: () => {
        result.undo();
        setAdded(null);
      },
    });
  };
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), duration.toast);
    return () => clearTimeout(t);
  }, [added]);
  const withLine = (key: string, fn: (line: GroceryLine) => void) => {
    const line = list.byKey.get(key);
    if (line) fn(line);
  };
  const deleteLine = (l: GroceryLine) => {
    remove.mutate({ id: l.id }, { onError });
    toast.show({
      message: `Deleted ${l.label}`,
      action: { label: 'Undo', onPress: () => remove.mutate({ id: l.id, restore: l }, { onError }) },
    });
  };
  // From the edit sheet: let it slide away, so the toast shows on the list.
  const fromSheet = (fn: (l: GroceryLine) => void) => () => {
    const line = editing;
    setEditing(null);
    if (line) fn(line);
  };

  const toBuyCount = list.toBuy.length;
  const cartCount = list.inCart.length;
  const empty = list.lines.length === 0;
  useEffect(() => {
    if (!empty) setAllPutAway(false);
  }, [empty]);
  useToastInset(focused && cartCount > 0);
  const pull = usePullToRefresh(list.refetch);

  return (
    <Screen
      tabBar
      gap="xxl"
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      footer={
        <Reveal visible={cartCount > 0}>
          <Button label={`Done shopping · ${cartCount}`} size="lg" fullWidth onPress={() => setConfirmDone(true)} />
        </Reveal>
      }
    >
      <Stack gap="lg">
        <LargeTitle
          overline={people.sharedWith}
          overlineAccessory={<AvatarGroup names={people.names} />}
          title="Groceries"
          aside={toBuyCount > 0 ? `${toBuyCount} to buy` : cartCount > 0 ? 'All in the cart' : undefined}
          action={
            <IconButton
              icon="add"
              variant="ink"
              accessibilityLabel="Add to groceries"
              accessibilityHint="Puts the keyboard up in the field"
              onPress={() => setAddTapped(String(Date.now()))}
            />
          }
        />
        {sync ? <InlineNote icon="offline" text={sync} /> : null}
        <QuickAddField
          // A new request from Home ("Add to groceries") remounts the field with the keyboard up.
          key={addRequest ?? 'quick-add'}
          autoFocus={!!addRequest}
          placeholder="Type anything: 2 avocados, milk…"
          catalog={catalog}
          onSubmit={addTyped}
          confirmation={added}
          // The usual picks share the line under the field, so nothing below it moves as you type or add.
          idle={
            picks.length > 0 ? (
              <ChipRow accessibilityLabel="Usual items">
                <Text variant="caption" color="inkMuted">
                  Usual
                </Text>
                {picks.map((pick) => (
                  <Chip
                    key={pick.product_id}
                    label={pick.name}
                    icon="add"
                    haptic="add"
                    accessibilityLabel={`Add ${pick.name}`}
                    onPress={() => addAndFlash(add([usualToInput(pick)], 'usual', onError))}
                  />
                ))}
              </ChipRow>
            ) : undefined
          }
        />
      </Stack>

      <ScanInbox {...review.inbox} />

      {list.isLoading ? (
        <ListSkeleton rows={5} leading="check" />
      ) : list.isError && !list.data ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : empty && allPutAway ? (
        <EmptyState
          art={<SuccessBurst size="sm" accessibilityLabel="Done" />}
          title="All put away"
          text="Your pantry is up to date. Type anything to start the next list."
        />
      ) : empty ? (
        <EmptyState icon="store" title="Your list is empty" text="Type anything, like 2 avocados, milk." />
      ) : (
        <GroceryList
          aisles={list.listAisles}
          cart={list.listCart}
          flashKeys={flash}
          onCheck={(key) => withLine(key, (l) => toggle.mutate({ id: l.id, checked: true }, { onError }))}
          onUncheck={(key) => withLine(key, (l) => toggle.mutate({ id: l.id, checked: false }, { onError }))}
          onEdit={(key) => withLine(key, setEditing)}
          onHave={(key) => withLine(key, markHave)}
          onDelete={(key) => withLine(key, deleteLine)}
        />
      )}

      <GroceryEditSheet
        item={editing}
        recipes={editing ? lineRecipes(editing) : undefined}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          if (editing) update.save(editing, values);
          setEditing(null);
        }}
        onHave={fromSheet(markHave)}
        onDelete={fromSheet(deleteLine)}
      />
      <PutAwaySheet
        visible={confirmDone}
        items={putAway.items}
        leftOnList={toBuyCount}
        keepsOptions={KEEPS_OPTIONS}
        onChange={putAway.change}
        loading={complete.isPending}
        onScanReceipt={() => {
          // The camera can't open over a sheet: let it slide away first.
          setConfirmDone(false);
          setTimeout(() => review.scan('receipt'), duration.sheet);
        }}
        onClose={() => setConfirmDone(false)}
        onConfirm={() => {
          const choices = putAway.payload();
          // Nothing left to buy: the list empties at once (optimistic) and celebrates.
          const clearing = toBuyCount === 0;
          setConfirmDone(false);
          if (clearing) setAllPutAway(true);
          complete.mutate(choices, {
            onSuccess: (n) => {
              haptics.success();
              putAway.reset();
              if (!clearing) toast.show({ message: `${plural(n, 'thing', 'things')} put away. Pantry's up to date.` });
            },
            onError: (e) => {
              setAllPutAway(false);
              onError(e);
            },
          });
        }}
      />
      <ProposalSheet {...review.sheet} />
    </Screen>
  );
}
