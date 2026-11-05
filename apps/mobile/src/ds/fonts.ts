import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Urbanist_600SemiBold } from '@expo-google-fonts/urbanist/600SemiBold';
import { useFonts } from 'expo-font';

import { fontFamily } from './tokens';

const sources = {
  [fontFamily.urbanist600]: Urbanist_600SemiBold,
  [fontFamily.figtree400]: Figtree_400Regular,
  [fontFamily.figtree600]: Figtree_600SemiBold,
};

/** True once the DS fonts are ready (or failed: the system font is used then). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(sources);
  return loaded || error !== null;
}
