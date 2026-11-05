import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, size, space } from './tokens';

export interface TabBarSpace {
  /** Distance from the screen bottom to the tab bar's bottom edge. */
  bottom: number;
  /** Space the floating tab bar takes, from the screen bottom to just above it. */
  occupied: number;
}

/** Geometry of the floating tab bar, shared by the TabBar, Screen insets and toasts. */
export function useTabBarSpace(): TabBarSpace {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, layout.tabBarEdge);
  return { bottom, occupied: bottom + size.tabBar + space.md };
}
