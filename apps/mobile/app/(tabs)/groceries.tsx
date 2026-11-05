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
  useGroceries,
  useHouseholdPeople,
  useMarkHave,
  usePullToRefresh,
  usePutAway,
  useScanReview,
  useToggleItem,
  useUpdateItem,
  useUsualProducts,
  usualToInput,
  toAddInputs,
  type GroceryLine,
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
  LargeTitle,
  ListSkeleton,
  ProposalSheet,
  PutAwaySheet,
  QuickAddField,
  ScanInbox,
  Screen,
  Stack,
  Text,
  duration,
  haptics,
  useToast,
  useToastInset,
} from '@/ds';

export default function GroceriesScreen() {
  const { add: addRequest } = useLocalSearchParams<{ add?: string }>();
  const toast = useToast();
  const people = useHouseholdPeople();
  const catalog = useCatalogIndex();
  const list = useGroceries({ live: true });
  const { add } = useAddGroceries();
  const toggle = useToggleItem();
  const have = useMarkHave();
  const remove = useDeleteItem();
  const update = useUpdateItem(catalog);
  const complete = useCompleteShopping();
  const { picks } = useUsualProducts(catalog);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<GroceryLine | null>(null);
  const [confirmDone, setConfirmDone] = useState(false);
  const putAway = usePutAway(list.inCart);
  const review = useScanReview((message) => toast.show({ message }));

  useEffect(() => {
    if (flash.size === 0) return;
    const t = setTimeout(() => setFlash(new Set()), duration.flash);
    return () => clearTimeout(t);
  }, [flash]);

  const onError = (e: unknown) => toast.show({ message: friendlyError(e, "Couldn't save that. Try again.") });
  const addAndFlash = (result: { keys: string[] }) => setFlash(new Set(result.keys));
  const withLine = (key: string, fn: (line: GroceryLine) => void) => {
    const line = list.byKey.get(key);
    if (line) fn(line);
  };

  const toBuyCount = list.toBuy.length;
  const cartCount = list.inCart.length;
  const empty = list.lines.length === 0;
  const focused = useIsFocused();
  useToastInset(focused && cartCount > 0);
  const pull = usePullToRefresh(list.refetch);

  return (
    <Screen
      tabBar
      gap="xxl"
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      footer={
        cartCount > 0 ? (
          <Button label={`Done shopping · ${cartCount}`} size="lg" fullWidth onPress={() => setConfirmDone(true)} />
        ) : undefined
      }
    >
      <Stack gap="lg">
        <LargeTitle
          overline={people.sharedWith}
          overlineAccessory={<AvatarGroup names={people.names} />}
          title="Groceries"
          aside={toBuyCount > 0 ? `${toBuyCount} to buy` : cartCount > 0 ? 'All in the cart' : undefined}
        />
        <Stack gap="md">
          <QuickAddField
            // A new request from Home ("Add to groceries") remounts the field with the keyboard up.
            key={addRequest ?? 'quick-add'}
            autoFocus={!!addRequest}
            placeholder="Type anything: 2 aguacates, leche…"
            catalog={catalog}
            onSubmit={(items: ResolvedGroceryItem[]) => addAndFlash(add(toAddInputs(items), 'manual', onError))}
          />
          {picks.length > 0 ? (
            <ChipRow wrap accessibilityLabel="Usual items">
              <Text variant="caption" color="inkMuted">
                Usual
              </Text>
              {picks.map((pick) => (
                <Chip
                  key={pick.product_id}
                  label={pick.name}
                  icon="add"
                  accessibilityLabel={`Add ${pick.name}`}
                  onPress={() => {
                    haptics.add();
                    addAndFlash(add([usualToInput(pick)], 'usual', onError));
                  }}
                />
              ))}
            </ChipRow>
          ) : null}
        </Stack>
      </Stack>

      <ScanInbox {...review.inbox} />

      {list.isLoading ? (
        <ListSkeleton rows={5} />
      ) : list.isError && !list.data ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : empty ? (
        <EmptyState icon="basket" title="Your list is empty." text="Type anything, like 2 aguacates, leche." />
      ) : (
        <GroceryList
          aisles={list.listAisles}
          cart={list.listCart}
          flashKeys={flash}
          onCheck={(key) => withLine(key, (l) => toggle.mutate({ id: l.id, checked: true }, { onError }))}
          onUncheck={(key) => withLine(key, (l) => toggle.mutate({ id: l.id, checked: false }, { onError }))}
          onEdit={(key) => withLine(key, setEditing)}
          onHave={(key) =>
            withLine(key, (l) => {
              have.mutate(l.id, { onError });
              toast.show({ message: `Noted, you have ${l.label}` });
            })
          }
          onDelete={(key) =>
            withLine(key, (l) => {
              remove.mutate({ id: l.id }, { onError });
              toast.show({
                message: `Deleted ${l.label}`,
                action: { label: 'Undo', onPress: () => remove.mutate({ id: l.id, restore: l }, { onError }) },
              });
            })
          }
        />
      )}

      <GroceryEditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          if (editing) update.save(editing, values);
          setEditing(null);
        }}
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
          haptics.success();
          const choices = putAway.payload();
          setConfirmDone(false);
          complete.mutate(choices, {
            onSuccess: (n) => {
              putAway.reset();
              toast.show({ message: `${plural(n, 'thing', 'things')} put away. Pantry's up to date.` });
            },
            onError,
          });
        }}
      />
      <ProposalSheet {...review.sheet} />
    </Screen>
  );
}
