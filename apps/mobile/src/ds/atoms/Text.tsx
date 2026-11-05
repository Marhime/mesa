import type { ReactNode } from 'react';
import { Text as RNText, type AccessibilityRole, type TextStyle } from 'react-native';

import { useTheme } from '../theme';
import { maxFontScale, typography, type ColorToken, type TypeVariant } from '../tokens';

export interface TextProps {
  children: ReactNode;
  variant?: TypeVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  /** Struck-through text (items in the cart). */
  strike?: boolean;
  /** Underlined text (tertiary actions). */
  underline?: boolean;
  /** Tabular figures for numbers that change (counts, steppers). */
  tabular?: boolean;
  flex?: boolean;
  selectable?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessible?: boolean;
  onPress?: () => void;
}

/** Every piece of text in Mesa. Variants come from the closed type scale. */
export function Text({
  children,
  variant = 'body',
  color = 'ink',
  align,
  numberOfLines,
  strike,
  underline,
  tabular,
  flex,
  selectable,
  accessibilityRole,
  accessibilityLabel,
  accessible,
  onPress,
}: TextProps) {
  const theme = useTheme();
  const decoration: TextStyle['textDecorationLine'] =
    strike && underline ? 'underline line-through' : strike ? 'line-through' : underline ? 'underline' : 'none';
  const style: TextStyle = {
    ...typography[variant],
    color: theme.colors[color],
    textAlign: align,
    textDecorationLine: decoration,
    fontVariant: tabular ? ['tabular-nums'] : undefined,
    flexShrink: 1,
    flexGrow: flex ? 1 : undefined,
    flexBasis: flex ? 0 : undefined,
  };
  return (
    <RNText
      style={style}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontScale}
      selectable={selectable}
      accessibilityRole={accessibilityRole ?? (variant === 'display' || variant === 'title' ? 'header' : undefined)}
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      onPress={onPress}
      suppressHighlighting
    >
      {children}
    </RNText>
  );
}
