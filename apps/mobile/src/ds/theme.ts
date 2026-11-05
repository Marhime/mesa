import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import type { Category } from '@mesa/shared';

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

import { categoryPastel, palettes, type ColorScheme, type ColorToken, type Palette } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
}

const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', colors: palettes.light },
  dark: { scheme: 'dark', colors: palettes.dark },
};

/** The current theme. Follows the system color scheme. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return themes[scheme === 'dark' ? 'dark' : 'light'];
}

export function color(theme: Theme, token: ColorToken): string {
  return theme.colors[token];
}

/** Pastel for a food category; `other` uses the sunken surface. */
export function categoryColor(theme: Theme, category: Category): string {
  return category === 'other' ? theme.colors.surfaceSunken : categoryPastel[category];
}

/**
 * Background for things drawn or written in ink on a category color (pictograms, Use soon cards):
 * the pastel, or for `other` the light sunken surface in both themes, so ink stays readable in dark mode.
 */
export function tintColor(category: Category): string {
  return category === 'other' ? palettes.light.surfaceSunken : categoryPastel[category];
}

/**
 * Builds a themed StyleSheet once per color scheme.
 * `const useStyles = createStyles((t) => ({ root: { backgroundColor: t.colors.surface } }))`.
 */
export function createStyles<T extends NamedStyles>(factory: (theme: Theme) => T): () => Readonly<T> {
  const cache = new Map<ColorScheme, Readonly<T>>();
  return function useStyles(): Readonly<T> {
    const theme = useTheme();
    let styles = cache.get(theme.scheme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, styles);
    }
    return styles;
  };
}
