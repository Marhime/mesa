import { useTheme } from '../theme';
import { iconSize, type ColorToken, type IconSize } from '../tokens';
import { icons, type IconName } from './icons';

export interface IconProps {
  name: IconName;
  size?: IconSize;
  color?: ColorToken;
  /** bold everywhere; duotone for the active tab; fill for toggled states (favorite). */
  weight?: 'bold' | 'duotone' | 'fill';
}

/** Phosphor icon, decorative by default (the control around it carries the label). */
export function Icon({ name, size = 'md', color = 'ink', weight = 'bold' }: IconProps) {
  const theme = useTheme();
  const Glyph = icons[name];
  return <Glyph size={iconSize[size]} color={theme.colors[color]} weight={weight} />;
}
