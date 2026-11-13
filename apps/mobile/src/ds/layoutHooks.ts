import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, size, space } from './tokens';

export interface TabBarSpace {
  /** Distance from the screen bottom to the tab bar's bottom edge. */
  bottom: number;
  /** Space the floating tab bar takes (with what floats above it), from the screen bottom to just above it. */
  occupied: number;
}

interface Accessory {
  shown: boolean;
  setShown: (shown: boolean) => void;
}

const AccessoryContext = createContext<Accessory>({ shown: false, setShown: () => undefined });

/** Knows whether something floats above the tab bar (the Mesa button), so screens and toasts keep clear of it. */
export function TabBarSpaceProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const value = useMemo(() => ({ shown, setShown }), [shown]);
  return createElement(AccessoryContext.Provider, { value }, children);
}

/** The TabBar says while its accessory is up. */
export function useTabBarAccessory(shown: boolean): void {
  const { setShown } = useContext(AccessoryContext);
  useEffect(() => {
    setShown(shown);
    return () => setShown(false);
  }, [shown, setShown]);
}

/** Geometry of the floating tab bar, shared by the TabBar, Screen insets and toasts. */
export function useTabBarSpace(): TabBarSpace {
  const insets = useSafeAreaInsets();
  const { shown } = useContext(AccessoryContext);
  const bottom = Math.max(insets.bottom, layout.tabBarEdge);
  const accessory = shown ? size.tabAccessory + space.sm : 0;
  return { bottom, occupied: bottom + size.tabBar + space.md + accessory };
}
