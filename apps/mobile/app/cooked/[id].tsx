import { useLocalSearchParams, useRouter } from 'expo-router';

import { cookedRows, doneTitle, useCookedResult, usePictoLookup } from '@/data';
import { Button, EmptyState, FoodRow, ListGroup, Reveal, Screen, SectionHeader, Stack, Sticker, SuccessBurst, Text, duration } from '@/ds';

export default function CookedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const result = useCookedResult(id);
  const pictoFor = usePictoLookup();
  const done = () => router.dismissTo('/');
  const footer = <Button label="Done" size="lg" fullWidth onPress={done} />;

  if (!result) {
    return (
      <Screen centered footer={footer}>
        <EmptyState icon="cook" title="Cooked!" text="Your pantry is up to date." />
      </Screen>
    );
  }

  const rows = cookedRows(result.items, pictoFor);
  const saved = result.items.filter((i) => i.saved).length;
  return (
    <Screen footer={footer} gap="xxl">
      {/* The seal lands (with the buzz), then the words, the sticker and the list follow it in. */}
      <Stack align="center" gap="md">
        <SuccessBurst accessibilityLabel="Cooked" haptic />
        <Reveal delay={duration.small}>
          <Stack align="center" gap="md">
            <Text variant="display" align="center">
              {doneTitle(result.title)}
            </Text>
            <Text variant="bodyLg" color="inkMuted" align="center">
              {rows.length > 0 ? 'Enjoy. Your pantry is already up to date.' : 'Enjoy. Nothing in it came from the pantry.'}
            </Text>
          </Stack>
        </Reveal>
        {saved > 0 ? (
          <Sticker tilt="right" icon="sparkle" delay={duration.pop} label={`${saved} ${saved === 1 ? 'item' : 'items'} saved from the bin`} />
        ) : null}
      </Stack>

      {rows.length > 0 ? (
        <Reveal delay={duration.pop + duration.press}>
          <Stack gap="md">
            <SectionHeader title="Taken from your pantry" action={{ label: 'Review', onPress: () => router.dismissTo('/pantry') }} />
            <ListGroup inset="picto">
              {rows.map((row) => (
                <FoodRow
                  key={row.key}
                  picto={row.picto}
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
        </Reveal>
      ) : null}
    </Screen>
  );
}
