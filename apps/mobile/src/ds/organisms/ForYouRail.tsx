import Animated from 'react-native-reanimated';

import { Stack } from '../atoms/Stack';
import { InlineNote } from '../molecules/InlineNote';
import { Rail } from '../molecules/Rail';
import { SectionHeader } from '../molecules/SectionHeader';
import { enter, exit } from '../motion';
import { size } from '../tokens';
import { VideoCard } from './VideoCard';

export interface ForYouRailProps {
  videos: { key: string; title: string; meta: string | null; why: string; thumbnail: string | null }[];
  /** The suggestion whose import is starting. */
  savingKey?: string | null;
  /** Said instead while nothing has come yet ("Your first suggestions arrive on Monday."). */
  note?: string | null;
  onSave: (key: string) => void;
  onWatch: (key: string) => void;
  /** "Not for us". */
  onDismiss: (key: string) => void;
}

const TITLE = 'For you this week';

/** "For you this week" in Recipes: real recipe videos Mesa picked, each with why. Nothing when there are none (and no note). */
export function ForYouRail({ videos, savingKey, note, onSave, onWatch, onDismiss }: ForYouRailProps) {
  if (videos.length === 0 && !note) return null;
  return (
    <Animated.View entering={enter()} exiting={exit()}>
      <Stack gap="md">
        <SectionHeader title={TITLE} subtitle={videos.length > 0 ? 'Picked from what you cook' : undefined} />
        {videos.length === 0 && note ? (
          <InlineNote icon="sparkle" text={note} />
        ) : (
          <Rail accessibilityLabel={TITLE} itemWidth={size.videoCard}>
            {videos.map((v) => (
              <VideoCard
                key={v.key}
                title={v.title}
                meta={v.meta}
                why={v.why}
                thumbnail={v.thumbnail}
                saving={savingKey === v.key}
                onSave={() => onSave(v.key)}
                onWatch={() => onWatch(v.key)}
                dismiss={{ label: 'Not for us', hint: 'Mesa suggests fewer like this', onPress: () => onDismiss(v.key) }}
              />
            ))}
          </Rail>
        )}
      </Stack>
    </Animated.View>
  );
}
