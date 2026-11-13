import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Simmer } from '../atoms/Simmer';
import { easeOut } from '../motion';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { duration, radius, size, space } from '../tokens';

export interface StageProgressProps {
  /** What is happening now ("Watching the video"). */
  label: string;
  /** One more line ("Ingredients on screen, voice-over and caption"). */
  detail?: string | null;
  /** The current step starts at `from` and may ease toward `to` (0–1) while it lasts. */
  from: number;
  to: number;
  /** About how long the step takes: the bar slows down as it nears `to`, never claiming it is done. */
  expectedMs: number;
  /** When the step began (ms since epoch): coming back to the screen continues instead of restarting. */
  since: number;
  step?: { index: number; count: number };
  /** Fills the bar (the job finished). */
  done?: boolean;
  /** Inside a card that already has a background (a list row). */
  bare?: boolean;
}

// A progress bar is information, not decoration: it moves even with Reduce motion on.
const ease = (ms: number) => ({ duration: ms, easing: easeOut, reduceMotion: ReduceMotion.Never });

/** Where the bar should be after `elapsed` ms of a step expected to take `expected` ms. */
function position(from: number, to: number, elapsed: number, expected: number): number {
  return from + (to - from) * (1 - Math.exp(-Math.max(0, elapsed) / Math.max(1, expected)));
}

/**
 * A long job in steps (an import): the simmering bubbles, what is happening, "2 of 4", and a bar driven by
 * the real step, easing forward inside it so it never looks stuck.
 */
export function StageProgress({ label, detail, from, to, expectedMs, since, step, done, bare }: StageProgressProps) {
  const styles = useStyles();
  const progress = useSharedValue(from);

  useEffect(() => {
    if (done) {
      progress.set(withTiming(1, ease(duration.small)));
      return;
    }
    const now = position(from, to, Date.now() - since, expectedMs);
    const start = Math.max(progress.get(), now);
    // Catch up to where the step is, then drift toward its end over a few expected lengths.
    progress.set(withSequence(withTiming(start, ease(duration.small)), withTiming(to, ease(expectedMs * 3))));
  }, [from, to, expectedMs, since, done, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${Math.round(progress.get() * 1000) / 10}%` }));
  const pct = Math.round((done ? 1 : from) * 100);

  return (
    <View
      style={[styles.root, bare ? null : styles.card]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={[label, detail, step ? `step ${step.index} of ${step.count}` : null].filter(Boolean).join(', ')}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        {done ? null : <Simmer size="sm" />}
        <Text variant="label" flex numberOfLines={2}>
          {label}
        </Text>
        {step ? (
          <Text variant="caption" color="inkMuted">
            {`${step.index} of ${step.count}`}
          </Text>
        ) : null}
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
      {detail ? (
        <Text variant="caption" color="inkMuted">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  root: { gap: space.sm },
  card: { padding: space.lg, borderRadius: radius.lg, backgroundColor: t.colors.surfaceSunken },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: size.progressBar, borderRadius: radius.full, backgroundColor: t.colors.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: t.colors.ink },
}));
