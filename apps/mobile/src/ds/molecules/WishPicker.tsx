import { Chip } from '../atoms/Chip';
import { Stack } from '../atoms/Stack';
import { TextField } from '../atoms/TextField';
import { ChipRow } from './ChipRow';

export interface WishPickerProps {
  /** What the chips are, spoken ("Wishes for the week"). */
  label: string;
  options: { label: string; selected: boolean }[];
  onToggle: (label: string) => void;
  /** Anything else, typed. */
  text: string;
  onChangeText: (text: string) => void;
  /** The field's spoken label, also its placeholder unless one is given. */
  textLabel: string;
  placeholder?: string;
  /** The keyboard's Go. */
  onSubmit?: () => void;
}

/** What someone asks Mesa for: chips to tick (as many as they like) and a field for anything else. */
export function WishPicker({ label, options, onToggle, text, onChangeText, textLabel, placeholder, onSubmit }: WishPickerProps) {
  return (
    <Stack gap="lg">
      <ChipRow wrap accessibilityLabel={label}>
        {options.map((o) => (
          <Chip key={o.label} label={o.label} selected={o.selected} onPress={() => onToggle(o.label)} />
        ))}
      </ChipRow>
      <TextField
        value={text}
        onChangeText={onChangeText}
        label={textLabel}
        placeholder={placeholder}
        clearable
        autoCapitalize="sentences"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
    </Stack>
  );
}
