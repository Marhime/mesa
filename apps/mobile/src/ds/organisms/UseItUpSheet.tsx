import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import { Stack } from '../atoms/Stack';
import { Banner } from '../molecules/Banner';
import { InlineNote } from '../molecules/InlineNote';
import { ListGroup } from '../molecules/ListGroup';
import { ListRow } from '../molecules/ListRow';
import { ProgressNote } from '../molecules/ProgressNote';
import { Reveal } from '../molecules/Reveal';
import { Sheet } from '../molecules/Sheet';
import { SuggestionCard } from '../molecules/SuggestionCard';
import { duration } from '../tokens';

export interface UseItUpIdea {
  key: string;
  title: string;
  /** "Uses tomato and crema". */
  uses: string | null;
  /** "To buy onion"; null when nothing is missing. */
  toBuy: string | null;
  minutes: string | null;
  why: string | null;
}

export interface UseItUpSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The food, as it reads mid-sentence ("tomato"). */
  food: string;
  state: 'working' | 'ready' | 'failed';
  ideas: UseItUpIdea[];
  /** Why there is nothing to show (failed, no ideas, cancelled). */
  message: string | null;
  /** Asks again; absent when that can't work before tomorrow (the sheet then only closes). */
  onRetry?: () => void;
  /** Opens a video search for the idea. */
  onVideo: (key: string) => void;
  /** The household's own recipes with this food. */
  onRecipes: () => void;
}

/** "Ideas for tomato": dishes Mesa suggests to use a food before it turns, and the recipes you already have with it. */
export function UseItUpSheet({ visible, onClose, food, state, ideas, message, onRetry, onVideo, onRecipes }: UseItUpSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Ideas for ${food}`}
      // A way out is the sheet's main action: full width at the bottom.
      footer={state === 'failed' && onRetry ? <Button label="Try again" size="lg" fullWidth iconStart="retry" onPress={onRetry} /> : undefined}
    >
      {state === 'working' ? <ProgressNote text={`Thinking of dishes with ${food}…`} canLeave /> : null}

      {state === 'ready' ? (
        <Stack gap="md">
          {ideas.map((idea, i) => (
            <Reveal key={idea.key} delay={i * duration.press}>
              <SuggestionCard
                title={idea.title}
                minutes={idea.minutes}
                why={idea.why}
                details={[idea.uses, idea.toBuy]}
                action={{ label: 'Find a video', icon: 'play', onPress: () => onVideo(idea.key), accessibilityHint: 'Searches YouTube for this dish' }}
              />
            </Reveal>
          ))}
        </Stack>
      ) : null}

      {state === 'failed' ? <Banner tone="warning" text={message ?? "Couldn't come up with ideas right now."} /> : null}

      <Stack gap="lg">
        <InlineNote icon="sparkle" text="Ideas, not recipes yet: save one from a video to cook it." />
        <ListGroup tone="sunken">
          <ListRow leading={<Icon name="recipes" />} title={`Your recipes with ${food}`} chevron onPress={onRecipes} />
        </ListGroup>
      </Stack>
    </Sheet>
  );
}
