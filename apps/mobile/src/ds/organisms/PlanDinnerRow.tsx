import { Tag } from '../atoms/Tag';
import { Text } from '../atoms/Text';
import { CheckRow } from '../molecules/CheckRow';
import { Meta } from '../molecules/Meta';

export interface PlanDinnerRowProps {
  title: string;
  /** "Monday"; null when the order doesn't matter. */
  day: string | null;
  /** Why Mesa picked it. */
  why: string | null;
  /** "Uses cream and avocado". */
  uses: string | null;
  checked: boolean;
  /** Already On the menu: "On the menu" instead of a checkbox. */
  onMenu: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/** A dinner Mesa planned: the day, the recipe, why, what it uses up; tap to tick or untick it. */
export function PlanDinnerRow({ title, day, why, uses, checked, onMenu, disabled, onToggle }: PlanDinnerRowProps) {
  const label = [day, title, why, uses].filter(Boolean).join(', ');
  return (
    <CheckRow
      checked={checked}
      onToggle={onMenu ? undefined : onToggle}
      done={<Tag variant="outline" icon="check" label="On the menu" />}
      disabled={disabled}
      accessibilityLabel={onMenu ? `${label}, on the menu` : label}
    >
      {day ? (
        <Text variant="overline" color="inkMuted">
          {day}
        </Text>
      ) : null}
      <Text variant="label" numberOfLines={2}>
        {title}
      </Text>
      {why ? (
        <Text variant="caption" color="inkMuted">
          {why}
        </Text>
      ) : null}
      {uses ? <Meta icon="checkCircle" text={uses} /> : null}
    </CheckRow>
  );
}
