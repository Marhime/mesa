import { View } from 'react-native';

import { Chip } from '../atoms/Chip';
import type { IconName } from '../atoms/icons';
import { Simmer } from '../atoms/Simmer';
import { Stack } from '../atoms/Stack';
import { Text } from '../atoms/Text';
import { Banner } from '../molecules/Banner';
import { ChipRow } from '../molecules/ChipRow';
import { ProgressNote } from '../molecules/ProgressNote';
import { Rail } from '../molecules/Rail';
import { Reveal } from '../molecules/Reveal';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';
import { AskVideos, type AskVideosProps } from './AskVideos';
import { RecipeCard } from './RecipeCard';

export type AskActionKind = 'add_to_list' | 'plan' | 'open_recipe' | 'plan_week';

export interface AskTurnProps {
  /** Your words; empty while a question opened from a notification loads (no bubble). */
  question: string;
  state: 'working' | 'answered' | 'failed';
  /** While Mesa works: the answer's words so far (they appear as it writes); null before the first. */
  draft: string | null;
  answer: string | null;
  /** Why there is no answer. */
  message: string | null;
  /** Saved recipes the answer points to: a card each (why it fits under the title), opening it. */
  recipes: { key: string; title: string; why: string | null; imageUrl: string | null }[];
  /** What the answer offers to do; done ones say so and can't be tapped again. */
  actions: { key: string; kind: AskActionKind; label: string; done: boolean; busy: boolean }[];
  /** The videos Mesa looks for under the answer (it starts on its own); null when it doesn't. */
  find: Pick<AskVideosProps, 'state' | 'videos' | 'message'> | null;
  onRecipe: (key: string) => void;
  onAction: (key: string) => void;
  /** Ask it again (the last question only). */
  onRetry?: () => void;
  onSaveVideo: (key: string) => void;
  onWatchVideo: (key: string) => void;
  /** Look for the videos again; absent when that can't work before tomorrow. */
  onRetryFind?: () => void;
}

const ACTION_ICON: Record<AskActionKind, IconName> = { add_to_list: 'store', plan: 'plan', open_recipe: 'recipes', plan_week: 'plan' };
/** Adding to the list or the menu gives the `add` haptic at the touch; opening something doesn't. */
const ACTION_HAPTIC: Partial<Record<AskActionKind, 'add'>> = { add_to_list: 'add', plan: 'add' };

/**
 * One question to Mesa and its answer: your words on the right, the answer as it is written, the recipes
 * it means (cards), what it offers to do (chips), the videos it found.
 */
export function AskTurn({
  question,
  state,
  draft,
  answer,
  message,
  recipes,
  actions,
  find,
  onRecipe,
  onAction,
  onRetry,
  onSaveVideo,
  onWatchVideo,
  onRetryFind,
}: AskTurnProps) {
  const styles = useStyles();
  return (
    <Stack gap="md">
      {question !== '' ? (
        <View style={styles.question} accessible accessibilityLabel={`You asked: ${question}`}>
          <Text variant="body">{question}</Text>
        </View>
      ) : null}

      {state === 'working' && draft ? (
        <Stack gap="sm">
          <Text variant="bodyLg">{draft}</Text>
          <Simmer size="sm" accessibilityLabel="Mesa is still writing" />
        </Stack>
      ) : null}
      {state === 'working' && !draft ? <ProgressNote text="Thinking…" canLeave /> : null}

      {state === 'failed' ? (
        <Banner
          tone="warning"
          text={message ?? "Mesa couldn't answer that right now."}
          action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
        />
      ) : null}

      {state === 'answered' && answer ? (
        <Stack gap="md">
          <Text variant="bodyLg" selectable>
            {answer}
          </Text>
          {recipes.length > 0 ? (
            <Reveal motion="fade">
              <Rail accessibilityLabel="Recipes" itemWidth={size.recipeRailCard}>
                {recipes.map((r) => (
                  <View key={r.key} style={styles.card}>
                    <RecipeCard title={r.title} imageUrl={r.imageUrl} seed={r.key} meta={r.why ?? undefined} onPress={() => onRecipe(r.key)} />
                  </View>
                ))}
              </Rail>
            </Reveal>
          ) : null}
          {actions.length > 0 ? (
            <Reveal motion="fade">
              <ChipRow wrap accessibilityLabel="What Mesa can do">
                {actions.map((a) =>
                  a.done || a.busy ? (
                    <Chip key={a.key} label={a.label} icon={a.done ? 'check' : ACTION_ICON[a.kind]} passive accessibilityLabel={a.done ? `${a.label}, done` : `${a.label}, working`} />
                  ) : (
                    <Chip key={a.key} label={a.label} icon={ACTION_ICON[a.kind]} haptic={ACTION_HAPTIC[a.kind]} onPress={() => onAction(a.key)} />
                  ),
                )}
              </ChipRow>
            </Reveal>
          ) : null}
        </Stack>
      ) : null}

      {state === 'answered' && find ? (
        <AskVideos {...find} onSave={onSaveVideo} onWatch={onWatchVideo} onRetry={onRetryFind} />
      ) : null}
    </Stack>
  );
}

const useStyles = createStyles((t) => ({
  // Your words, set apart on the right like a message you sent.
  question: {
    alignSelf: 'flex-end',
    marginLeft: space.huge,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surfaceSunken,
  },
  card: { width: size.recipeRailCard },
}));
