import { IconButton } from '../atoms/IconButton';

export interface DismissButtonProps {
  /** What it does, read by VoiceOver: "Hide Tinga", "Not for us", "Remove Fridge scan". */
  label: string;
  hint?: string;
  onPress: () => void;
}

/**
 * The × that hides a card: a ready or failed import, a scan, a suggested video. The same float disc at the
 * card's top right everywhere (it reads on a photo as well as on a card).
 */
export function DismissButton({ label, hint, onPress }: DismissButtonProps) {
  return <IconButton variant="float" icon="close" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} />;
}
