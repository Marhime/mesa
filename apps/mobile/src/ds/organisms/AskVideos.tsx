import { Banner } from '../molecules/Banner';
import { ProgressNote } from '../molecules/ProgressNote';
import { Rail } from '../molecules/Rail';
import { Reveal } from '../molecules/Reveal';
import { size } from '../tokens';
import { VideoCard } from './VideoCard';

export interface AskVideo {
  key: string;
  title: string;
  /** "Food is Love · 9 min". */
  meta: string | null;
  why: string;
  thumbnail: string | null;
  /** Already in Recipes, or saved from here. */
  saved: boolean;
  /** Its import is starting. */
  saving: boolean;
}

export interface AskVideosProps {
  state: 'working' | 'ready' | 'failed';
  videos: AskVideo[];
  /** Why there is nothing to show (the worker's words, no videos, cancelled). */
  message: string | null;
  onSave: (key: string) => void;
  onWatch: (key: string) => void;
  /** Look again; absent when that can't work before tomorrow (only the words show). */
  onRetry?: () => void;
}

/**
 * The real recipe videos Mesa looks for under an answer, without a tap: "Looking for videos…", then a
 * Rail of VideoCards (each with why; Save, Watch); nothing found → the worker's words and Try again.
 */
export function AskVideos({ state, videos, message, onSave, onWatch, onRetry }: AskVideosProps) {
  if (state === 'working') return <ProgressNote text="Looking for videos…" canLeave />;
  if (state === 'failed') {
    return (
      <Banner tone="warning" text={message ?? "Couldn't find videos right now."} action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined} />
    );
  }
  return (
    <Reveal motion="fade">
      <Rail accessibilityLabel="Recipe videos" itemWidth={size.videoCard}>
        {videos.map((v) => (
          <VideoCard
            key={v.key}
            tone="sunken"
            title={v.title}
            meta={v.meta}
            why={v.why}
            thumbnail={v.thumbnail}
            saved={v.saved}
            saving={v.saving}
            onSave={() => onSave(v.key)}
            onWatch={() => onWatch(v.key)}
          />
        ))}
      </Rail>
    </Reveal>
  );
}
