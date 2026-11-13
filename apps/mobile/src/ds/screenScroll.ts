import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/** The vertical scroll offset of the enclosing Screen, for scroll-linked chrome (hero parallax, TopBar fill). */
export const ScreenScrollContext = createContext<SharedValue<number> | null>(null);

/** Null outside a scrolling Screen. */
export function useScreenScroll(): SharedValue<number> | null {
  return useContext(ScreenScrollContext);
}
