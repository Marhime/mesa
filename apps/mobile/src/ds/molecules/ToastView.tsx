import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { haptics } from '../haptics';
import { drop, lift, rise, sink, springTo, timing } from '../motion';
import { createStyles } from '../theme';
import { gesture, layout, radius, shadow, size, space } from '../tokens';

export interface ToastContent {
  message: string;
  /** Optional action, usually "Undo". */
  action?: { label: string; onPress: () => void };
  /** error: a warning glyph (and a warning haptic when shown). */
  tone?: 'default' | 'error';
}

export interface ToastViewProps extends ToastContent {
  onDismiss: () => void;
  /** bottom: above the tab bar (default) · top: under the status bar, over a sheet. */
  placement?: 'bottom' | 'top';
  /** Distance from its edge (tab bar space, safe area). */
  offset: number;
}

/** Ink pill with an optional action. Rises in, sinks away; swipe it toward its edge to dismiss. */
export function ToastView({ message, action, tone, onDismiss, placement = 'bottom', offset }: ToastViewProps) {
  const styles = useStyles();
  const away = placement === 'bottom' ? 1 : -1;
  const drag = useSharedValue(0);
  const shown = useSharedValue(1);

  const pan = usePanGesture({
    activeOffsetY: [-gesture.activeOffset, gesture.activeOffset],
    onUpdate: (e) => {
      'worklet';
      const t = e.translationY * away;
      // Free toward the edge, resisting the other way.
      drag.set((t > 0 ? t : t / 4) * away);
    },
    onDeactivate: (e) => {
      'worklet';
      const t = e.translationY * away;
      if (t > gesture.toastDismiss || e.velocityY * away > gesture.dismissVelocity / 2) {
        // Swiped away: it leaves like everything that leaves (150 ms).
        drag.set(withTiming(away * size.buttonMd * 2, timing('leave')));
        shown.set(withTiming(0, timing('leave'), (done) => {
          if (done) scheduleOnRN(onDismiss);
        }));
      } else {
        drag.set(withSpring(0, springTo('sheet')));
      }
    },
  });
  const dragged = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: drag.get() }] }));

  return (
    <Animated.View
      style={[styles.wrap, placement === 'bottom' ? { bottom: offset } : { top: offset }]}
      entering={placement === 'bottom' ? rise() : drop()}
      exiting={placement === 'bottom' ? sink() : lift()}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.pill, dragged]} accessibilityLiveRegion="polite">
          {tone === 'error' ? <Icon name="warning" size="sm" color="onInk" /> : null}
          <Touchable onPress={onDismiss} accessibilityLabel={message} accessibilityHint="Dismisses the message" style={styles.message}>
            <Text variant="label" color="onInk" numberOfLines={2}>
              {message}
            </Text>
          </Touchable>
          {action ? (
            <Touchable
              onPress={() => {
                haptics.select();
                action.onPress();
                onDismiss();
              }}
              // "Undo, Deleted milk": the action names what it undoes.
              accessibilityLabel={`${action.label}, ${message}`}
              style={styles.action}
            >
              <Text variant="label" color="onInk" underline>
                {action.label}
              </Text>
            </Touchable>
          ) : null}
        </Animated.View>
      </GestureDetector>
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
