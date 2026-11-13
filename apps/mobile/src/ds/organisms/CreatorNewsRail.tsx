import Animated from 'react-native-reanimated';

import { Stack } from '../atoms/Stack';
import { Rail } from '../molecules/Rail';
import { SectionHeader } from '../molecules/SectionHeader';
import { enter, exit } from '../motion';
import { size } from '../tokens';
import { VideoCard } from './VideoCard';

export interface CreatorNewsRailProps {
  videos: { key: string; title: string; meta: string; thumbnail: string | null }[];
  /** The video whose import is starting. */
  savingKey?: string | null;
  onSave: (key: string) => void;
  onWatch: (key: string) => void;
  onDismiss: (key: string) => void;
}

/** "New from your creators" in Recipes: their new recipe videos, card by card. Nothing when there are none. */
export function CreatorNewsRail({ videos, savingKey, onSave, onWatch, onDismiss }: CreatorNewsRailProps) {
  if (videos.length === 0) return null;
  return (
    <Animated.View entering={enter()} exiting={exit()}>
      <Stack gap="md">
        <SectionHeader title="New from your creators" />
        <Rail accessibilityLabel="New from your creators" itemWidth={size.videoCard}>
          {videos.map((v) => (
            <VideoCard
              key={v.key}
              title={v.title}
              meta={v.meta}
              thumbnail={v.thumbnail}
              saving={savingKey === v.key}
              onSave={() => onSave(v.key)}
              onWatch={() => onWatch(v.key)}
              dismiss={{ label: 'Not now', hint: `Hides ${v.title} from New from your creators`, onPress: () => onDismiss(v.key) }}
            />
          ))}
        </Rail>
      </Stack>
    </Animated.View>
  );
}
