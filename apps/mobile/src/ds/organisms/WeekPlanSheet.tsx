import { Button } from '../atoms/Button';
import { Stack } from '../atoms/Stack';
import { Text } from '../atoms/Text';
import { Banner } from '../molecules/Banner';
import { InlineNote } from '../molecules/InlineNote';
import { ListGroup } from '../molecules/ListGroup';
import { ProgressNote } from '../molecules/ProgressNote';
import { Reveal } from '../molecules/Reveal';
import { Sheet } from '../molecules/Sheet';
import { WishPicker } from '../molecules/WishPicker';
import { PlanDinnerRow } from './PlanDinnerRow';

export interface WeekPlanDinner {
  key: string;
  title: string;
  day: string | null;
  why: string | null;
  uses: string | null;
  checked: boolean;
  onMenu: boolean;
}

export interface WeekPlanSheetProps {
  visible: boolean;
  onClose: () => void;
  /** ask: the wishes · working: Mesa plans · ready: the dinners · failed: why, and Try again (when it can work today). */
  state: 'ask' | 'working' | 'ready' | 'failed';
  wishes: { label: string; selected: boolean }[];
  onWish: (label: string) => void;
  other: string;
  onOther: (text: string) => void;
  onPlan: () => void;
  /** What was asked ("Quick on weekdays, vegetarian"); null for any week. */
  asked: string | null;
  dinners: WeekPlanDinner[];
  /** One line about the whole week. */
  note: string | null;
  onToggle: (key: string) => void;
  /** Dinners ticked (not already on the menu). */
  count: number;
  onAdd: () => void;
  adding: boolean;
  /** Why adding stopped ("Added 2 of 4. Couldn't add Tinga: …"). */
  error: string | null;
  /** Why there is no plan (the worker's words, nothing to suggest, cancelled). */
  message: string | null;
  /** Asks again; absent when that can't work before tomorrow (the sheet then only closes). */
  onRetry?: () => void;
  /** Back to the wishes. */
  onStartOver: () => void;
}

/** "Plan my week": wishes, then dinners Mesa picked among your recipes, all ticked; the ticked ones go On the menu. */
export function WeekPlanSheet({
  visible,
  onClose,
  state,
  wishes,
  onWish,
  other,
  onOther,
  onPlan,
  asked,
  dinners,
  note,
  onToggle,
  count,
  onAdd,
  adding,
  error,
  message,
  onRetry,
  onStartOver,
}: WeekPlanSheetProps) {
  // "Plan" is putting dinners on the menu (like a recipe's Plan it); asking Mesa for them is "Suggest".
  const footer =
    state === 'ask' ? (
      <Button label="Suggest dinners" size="lg" fullWidth onPress={onPlan} />
    ) : state === 'ready' ? (
      <>
        <Button
          label={count > 0 ? `Plan ${count} ${count === 1 ? 'dinner' : 'dinners'}` : 'Plan dinners'}
          size="lg"
          fullWidth
          disabled={count === 0}
          loading={adding}
          haptic="add"
          onPress={onAdd}
          accessibilityHint="Puts them on the menu and what's missing on your list"
        />
        <Button label="Change wishes" variant="ghost" fullWidth disabled={adding} onPress={onStartOver} />
      </>
    ) : state === 'failed' && onRetry ? (
      <>
        <Button label="Try again" size="lg" fullWidth iconStart="retry" onPress={onRetry} />
        <Button label="Change wishes" variant="ghost" fullWidth onPress={onStartOver} />
      </>
    ) : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Plan my week"
      description={state === 'ask' ? 'Dinners from your recipes: what goes soon first.' : (asked ?? undefined)}
      footer={footer}
    >
      {state === 'ask' ? (
        <WishPicker
          label="Wishes for the week"
          options={wishes}
          onToggle={onWish}
          text={other}
          onChangeText={onOther}
          textLabel="Anything else?"
          placeholder="Anything else? No fish, 3 dinners…"
          onSubmit={onPlan}
        />
      ) : null}

      {state === 'working' ? <ProgressNote text="Planning your week…" canLeave /> : null}

      {state === 'ready' ? (
        <Reveal>
          <Stack gap="md">
            {note ? <InlineNote icon="sparkle" text={note} /> : null}
            <Text variant="body" color="inkMuted">
              Untick what doesn't suit you.
            </Text>
            <ListGroup tone="sunken">
              {dinners.map((d) => (
                <PlanDinnerRow
                  key={d.key}
                  title={d.title}
                  day={d.day}
                  why={d.why}
                  uses={d.uses}
                  checked={d.checked}
                  onMenu={d.onMenu}
                  disabled={adding}
                  onToggle={() => onToggle(d.key)}
                />
              ))}
            </ListGroup>
            {/* Why adding stopped, in the body by the list it is about (the footer keeps the way out). */}
            {error ? (
              <Reveal motion="fade">
                <Banner tone="danger" text={error} />
              </Reveal>
            ) : null}
          </Stack>
        </Reveal>
      ) : null}

      {state === 'failed' ? <Banner tone="warning" text={message ?? "Couldn't plan your week right now."} /> : null}
    </Sheet>
  );
}
