import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { useTabBarSpace } from '../layoutHooks';
import { timing } from '../motion';
import { createStyles } from '../theme';
import { duration, layout, radius, shadow, size, space } from '../tokens';

export interface ToastOptions {
  message: string;
  /** Optional action, usually "Undo". */
  action?: { label: string; onPress: () => void };
  /** ms before it hides; default 4 s (6 s with an action). */
  duration?: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  hide: () => void;
  /** Extra space under the toast (a floating primary button). */
  setLift: (lift: number) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined, hide: () => undefined, setLift: () => undefined });

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

/** Hosts the single toast of the app, floating above the tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null);
  const [lift, setLift] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setCurrent({ ...options, id: counter.current });
    AccessibilityInfo.announceForAccessibility(options.message);
    timer.current = setTimeout(
      () => setCurrent(null),
      options.duration ?? (options.action ? duration.toast * 1.5 : duration.toast),
    );
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo(() => ({ show, hide, setLift }), [show, hide]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <Toast key={current.id} {...current} lift={lift} onDismiss={hide} /> : null}
    </ToastContext.Provider>
  );
}

interface ToastViewProps extends ToastOptions {
  onDismiss: () => void;
  lift?: number;
}

/** Ink pill at the bottom of the screen, with an optional action. */
export function Toast({ message, action, onDismiss, lift = 0 }: ToastViewProps) {
  const styles = useStyles();
  const tabSpace = useTabBarSpace();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.set(withTiming(1, timing('small')));
  }, [enter]);
  const animated = useAnimatedStyle(() => ({
    opacity: enter.get(),
    transform: [{ translateY: (1 - enter.get()) * space.lg }],
  }));

  return (
    <Animated.View style={[styles.wrap, { bottom: tabSpace.occupied + lift }, animated]} pointerEvents="box-none">
      <View style={styles.pill} accessibilityLiveRegion="polite">
        <Touchable onPress={onDismiss} accessibilityLabel={message} accessibilityHint="Dismisses the message" style={styles.message}>
          <Text variant="label" color="onInk" numberOfLines={2}>
            {message}
          </Text>
        </Touchable>
        {action ? (
          <Touchable
            onPress={() => {
              action.onPress();
              onDismiss();
            }}
            accessibilityLabel={action.label}
            style={styles.action}
          >
            <Text variant="label" color="onInk" underline>
              {action.label}
            </Text>
          </Touchable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const useStyles = createStyles((t) => ({
  wrap: { position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.buttonMd,
    borderRadius: radius.full,
    backgroundColor: t.colors.ink,
    paddingLeft: space.xl,
    paddingRight: space.sm,
    gap: space.sm,
    maxWidth: size.readable,
    ...shadow.lg,
  },
  message: { flexShrink: 1, paddingVertical: space.md, paddingRight: space.md },
  action: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: space.md },
}));
