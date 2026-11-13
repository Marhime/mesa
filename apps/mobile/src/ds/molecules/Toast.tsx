import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '../haptics';
import { useTabBarSpace } from '../layoutHooks';
import { duration, size, space } from '../tokens';
import { ToastView, type ToastContent } from './ToastView';

export interface ToastOptions extends ToastContent {
  /** ms before it hides; default 4 s (6 s with an action, 10 s while VoiceOver is on). */
  duration?: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  hide: () => void;
  /** Extra space under the toast (a floating primary button). */
  setLift: (lift: number) => void;
}

interface ToastHosts {
  current: (ToastOptions & { id: number }) | null;
  lift: number;
  /** The outlet (inside a sheet's modal) that shows toasts now; null = the app root. */
  host: number | null;
  register: (id: number) => void;
  unregister: (id: number) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined, hide: () => undefined, setLift: () => undefined });
const HostsContext = createContext<ToastHosts>({ current: null, lift: 0, host: null, register: () => undefined, unregister: () => undefined });

/** `const toast = useToast(); toast.show({ message: 'Added to Produce', action: { label: 'Undo', onPress } })`. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Keeps toasts above a screen's floating primary button while `active` (the screen is focused and shows it). */
export function useToastInset(active: boolean): void {
  const { setLift } = useContext(ToastContext);
  useEffect(() => {
    if (!active) return;
    setLift(size.buttonLg + space.md);
    return () => setLift(0);
  }, [active, setLift]);
}

/** True while VoiceOver runs: toasts then stay longer and queue behind what is being read. */
function useScreenReader(): RefObject<boolean> {
  const on = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => {
        on.current = v;
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v) => {
      on.current = v;
    });
    return () => sub.remove();
  }, []);
  return on;
}

/**
 * Hosts the single toast of the app, floating above the tab bar. A sheet's modal covers the app,
 * so while one is open its ToastOutlet shows the toast instead (at the top, clear of its buttons).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null);
  const [lift, setLift] = useState(0);
  const [hosts, setHosts] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const reader = useScreenReader();

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      counter.current += 1;
      setCurrent({ ...options, id: counter.current });
      if (options.tone === 'error') haptics.warning();
      // Queued: it doesn't cut off what VoiceOver is saying ("checked", "deleted").
      AccessibilityInfo.announceForAccessibilityWithOptions(options.message, { queue: true });
      const ms = reader.current
        ? Math.max(options.duration ?? 0, duration.toastA11y)
        : (options.duration ?? (options.action ? duration.toast * 1.5 : duration.toast));
      timer.current = setTimeout(() => setCurrent(null), ms);
    },
    [reader],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const register = useCallback((id: number) => setHosts((list) => [...list, id]), []);
  const unregister = useCallback((id: number) => setHosts((list) => list.filter((h) => h !== id)), []);
  const host = hosts.length > 0 ? hosts[hosts.length - 1]! : null;

  const api = useMemo(() => ({ show, hide, setLift }), [show, hide]);
  const hostsValue = useMemo(() => ({ current, lift, host, register, unregister }), [current, lift, host, register, unregister]);
  // Two-finger double tap (VoiceOver's magic tap) runs the toast's action: Undo without hunting for it.
  const magicTap = current?.action
    ? () => {
        current.action?.onPress();
        hide();
      }
    : undefined;

  return (
    <ToastContext.Provider value={api}>
      <HostsContext.Provider value={hostsValue}>
        <View style={styles.root} onMagicTap={magicTap}>
          {children}
          {host === null ? <RootToast /> : null}
        </View>
      </HostsContext.Provider>
    </ToastContext.Provider>
  );
}

function RootToast() {
  const { current, lift } = useContext(HostsContext);
  const { hide } = useContext(ToastContext);
  const tabSpace = useTabBarSpace();
  if (!current) return null;
  return <ToastView key={current.id} {...current} onDismiss={hide} offset={tabSpace.occupied + lift} />;
}

let outletIds = 0;

/**
 * Renders toasts inside a modal (Sheet) while it is `active` (open, not closing: a toast fired as a
 * sheet closes belongs on the screen underneath). The topmost active outlet wins.
 */
export function ToastOutlet({ active }: { active: boolean }) {
  const { current, host, register, unregister } = useContext(HostsContext);
  const { hide } = useContext(ToastContext);
  const insets = useSafeAreaInsets();
  const [id] = useState(() => ++outletIds);
  useEffect(() => {
    if (!active) return;
    register(id);
    return () => unregister(id);
  }, [active, id, register, unregister]);
  if (!current || host !== id) return null;
  return <ToastView key={current.id} {...current} onDismiss={hide} placement="top" offset={insets.top + space.sm} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
