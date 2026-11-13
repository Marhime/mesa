import { Button } from '../atoms/Button';
import { Chip } from '../atoms/Chip';
import { Stack } from '../atoms/Stack';
import { Text } from '../atoms/Text';
import { Banner } from '../molecules/Banner';
import { ListGroup } from '../molecules/ListGroup';
import { ProgressNote } from '../molecules/ProgressNote';
import { Reveal } from '../molecules/Reveal';
import { Sheet } from '../molecules/Sheet';
import { CreatorVideoRow } from './CreatorVideoRow';

export interface CreatorVideo {
  key: string;
  title: string;
  /** "68k views · 9 min". */
  meta: string | null;
  /** The dish, when the title says something else. */
  dish: string | null;
  thumbnail: string | null;
  /** Already in Recipes. */
  saved: boolean;
}

export interface CreatorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "Food is Love"; null while a pasted link names no one yet. */
  name: string | null;
  /** The Follow / Following toggle; null until the creator is known. */
  follow: { following: boolean; onToggle: () => void } | null;
  state: 'working' | 'ready' | 'failed';
  videos: CreatorVideo[];
  /** The picked videos (never saved ones). */
  picked: ReadonlySet<string>;
  /** At most this many at once. */
  max: number;
  onToggle: (key: string) => void;
  /** Opens the video in the in-app browser. */
  onWatch: (key: string) => void;
  /** Why there is nothing to show (the worker's words, no videos, cancelled). */
  message: string | null;
  /** Asks again; absent when that can't work before tomorrow (the sheet then only closes). */
  onRetry?: () => void;
  /** Imports the picked videos. */
  onImport: () => void;
  importing: boolean;
  /** Why the imports could not start. */
  error: string | null;
}

/** "Food is Love": a creator's latest recipe videos to pick and import, Follow, and Watch before saving. */
export function CreatorSheet({
  visible,
  onClose,
  name,
  follow,
  state,
  videos,
  picked,
  max,
  onToggle,
  onWatch,
  message,
  onRetry,
  onImport,
  importing,
  error,
}: CreatorSheetProps) {
  const count = picked.size;
  const full = count >= max;
  const canPick = state === 'ready' && videos.some((v) => !v.saved);

  const followChip = follow ? (
    <Chip
      label={follow.following ? 'Following' : 'Follow'}
      icon={follow.following ? 'check' : 'add'}
      selected={follow.following}
      accessibilityLabel={follow.following ? `Following ${name ?? 'this creator'}` : `Follow ${name ?? 'this creator'}`}
      accessibilityHint={follow.following ? 'Unfollows' : 'Keeps them in Your creators, in Recipes'}
      onPress={follow.onToggle}
    />
  ) : undefined;

  const footer = canPick ? (
    <Button label={count > 0 ? `Import ${count}` : 'Import'} size="lg" fullWidth disabled={count === 0} loading={importing} haptic="add" onPress={onImport} />
  ) : state === 'failed' && onRetry ? (
    // A way out is the sheet's main action: full width at the bottom, like Import.
    <Button label="Try again" size="lg" fullWidth iconStart="retry" onPress={onRetry} />
  ) : undefined;

  return (
    // Picked videos would be lost: closing asks first (Import closes it without asking).
    <Sheet visible={visible} onClose={onClose} unsaved={count > 0} title={name ?? 'Recipe videos'} action={followChip} footer={footer}>
      {state === 'working' ? (
        <ProgressNote text={name ? `Looking at ${name}'s latest recipes…` : 'Looking at the latest recipes…'} canLeave />
      ) : null}

      {state === 'ready' ? (
        <Stack gap="md">
          {canPick ? (
            <Text variant="body" color="inkMuted">
              {full ? `That's ${max}, the most at once.` : `Pick up to ${max} to save.`}
            </Text>
          ) : null}
          <ListGroup tone="sunken" inset="none">
            {videos.map((v) => {
              const checked = picked.has(v.key);
              return (
                <CreatorVideoRow
                  key={v.key}
                  title={v.title}
                  meta={v.meta}
                  dish={v.dish}
                  thumbnail={v.thumbnail}
                  saved={v.saved}
                  checked={checked}
                  disabled={full && !checked}
                  onToggle={() => onToggle(v.key)}
                  onWatch={() => onWatch(v.key)}
                />
              );
            })}
          </ListGroup>
          {/* Why the imports could not start, in the body (the footer keeps Import). */}
          {error ? (
            <Reveal motion="fade">
              <Banner tone="danger" text={error} />
            </Reveal>
          ) : null}
        </Stack>
      ) : null}

      {state === 'failed' ? <Banner tone="warning" text={message ?? "Couldn't list their videos right now."} /> : null}
    </Sheet>
  );
}
