import { useLocalSearchParams, useRouter } from 'expo-router';

import { cookedRows, doneTitle, useCookedResult } from '@/data';
import { Button, EmptyState, FoodRow, ListGroup, Screen, SectionHeader, Stack, Sticker, SuccessBurst, Text } from '@/ds';

export default function CookedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const result = useCookedResult(id);
  const done = () => router.dismissTo('/');
  const footer = <Button label="Done" size="lg" fullWidth onPress={done} />;

  if (!result) {
    return (
      <Screen centered footer={footer}>
        <EmptyState icon="cook" title="Cooked!" text="Your pantry is up to date." />
      </Screen>
    );
  }

  const rows = cookedRows(result.items);
  const saved = result.items.filter((i) => i.saved).length;
  return (
    <Screen footer={footer} gap="xxl">
      <Stack align="center" gap="md">
        <SuccessBurst accessibilityLabel="Cooked" />
        <Text variant="display" align="center">
          {doneTitle(result.title)}
        </Text>
        <Text variant="bodyLg" color="inkMuted" align="center">
          {rows.length > 0 ? 'Enjoy. Your pantry is already up to date.' : 'Enjoy. Nothing in it came from the pantry.'}
        </Text>
        {saved > 0 ? <Sticker tilt="right" icon="sparkle" label={`${saved} ${saved === 1 ? 'item' : 'items'} saved from the bin`} /> : null}
      </Stack>

      {rows.length > 0 ? (
        <Stack gap="md">
          <SectionHeader title="Taken from your pantry" action={{ label: 'Review', onPress: () => router.dismissTo('/pantry') }} />
          <ListGroup inset="none">
            {rows.map((row) => (
              <FoodRow
                key={row.key}
                category={row.category}
                title={row.name}
                detail={row.detail}
                detailIcon={row.ranOut ? 'store' : undefined}
                trailing={
                  row.delta ? (
                    <Text variant="heading" tabular>
                      {row.delta}
                    </Text>
                  ) : undefined
                }
              />
            ))}
          </ListGroup>
        </Stack>
      ) : null}
    </Screen>
  );
}
