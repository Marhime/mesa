import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../atoms/IconButton';
import { Text } from '../atoms/Text';
import { useKeyboardShown } from '../keyboard';
import { KeyboardAccessoryContext } from '../keyboardAccessory';
import { reflow, springTo, timing } from '../motion';
import { createStyles } from '../theme';
import { duration, layout, radius, shadow, size, space } from '../tokens';
import { useSheetClose } from './sheetClose';
import { useSheetDrag } from './sheetDrag';
import { ToastOutlet } from './Toast';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** One line under the title. */
  description?: string;
  /** A small control beside the title (Follow), before the ×. */
  action?: ReactNode;
  children?: ReactNode;
  /** Pinned under the content (primary action). */
  footer?: ReactNode;
  /**
   * Something typed or changed that closing would lose (compare with what was loaded, not "touched"). While
   * true, the scrim, the ×, a drag and VoiceOver's escape keep it open and ask "Discard changes?" (a drag
   * springs back first). Closing it from outside, after a Save, never asks.
   */
  unsaved?: boolean;
}

/**
 * Bottom sheet modal over a scrim. Springs up; closes with the scrim, the ×, or a drag down
 * (by the handle and header, or by the content once it is scrolled to the top), asking first when
 * `unsaved`. Its height follows its content smoothly, up to the room left above the keyboard (the content
 * scrolls, the header and footer stay in view). Toasts shown while it is open appear at the top, over it.
 */
export function Sheet({ visible, onClose, title, description, action, children, footer, unsaved = false }: SheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Over the keyboard, the footer sits just above it, not a home indicator's height away.
  const keyboard = useKeyboardShown();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const close = useSheetClose(onClose, unsaved);
  const drag = useSheetDrag(progress, height, close.request, close.held);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.set(withSpring(1, springTo('sheet')));
      return;
    }
    progress.set(withTiming(0, timing('sheet')));
    const t = setTimeout(() => setMounted(false), duration.sheet);
    return () => clearTimeout(t);
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get()) }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={close.request} statusBarTranslucent navigationBarTranslucent>
      {/* A modal is its own window: gestures need their own root inside it. Its fields never show a screen's footer. */}
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAccessoryContext value={null}>
          <KeyboardAvoidingView behavior="padding" style={styles.fill}>
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={close.request} accessible={false} />
            </Animated.View>
            {/* The room the sheet may take: under the status bar, above the keyboard (KeyboardAvoidingView). */}
            <View style={[styles.room, { paddingTop: insets.top + space.xxl }]} pointerEvents="box-none">
              <Animated.View style={[styles.shrink, drag.style]}>
                <Animated.View
                  layout={reflow()}
                  onLayout={drag.onLayout}
                  style={[styles.sheet, { paddingBottom: (keyboard ? 0 : insets.bottom) + space.lg }]}
                  accessibilityViewIsModal
                  // VoiceOver's scrub gesture (two-finger Z) closes it, like the ×.
                  onAccessibilityEscape={close.request}
                >
                  <GestureDetector gesture={drag.handle}>
                    <View>
                      <View style={styles.handleArea}>
                        <View style={styles.handle} />
                      </View>
                      {title ? (
                        <View style={styles.header}>
                          <View style={styles.headerText}>
                            <Text variant="title" accessibilityRole="header">
                              {title}
                            </Text>
                            {description ? (
                              <Text variant="body" color="inkMuted">
                                {description}
                              </Text>
                            ) : null}
                          </View>
                          {action ? <View style={styles.headerAction}>{action}</View> : null}
                          <IconButton icon="close" variant="plain" accessibilityLabel="Close" onPress={close.request} />
                        </View>
                      ) : null}
                    </View>
                  </GestureDetector>
                  {children ? (
                    <GestureDetector gesture={drag.content}>
                      <View style={styles.scrollArea}>
                        <ScrollView
                          simultaneousWith={drag.content}
                          style={styles.scroll}
                          contentContainerStyle={styles.content}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator={false}
                          bounces={false}
                          onScroll={drag.onScroll}
                          scrollEventThrottle={16}
                        >
                          {children}
                        </ScrollView>
                      </View>
                    </GestureDetector>
                  ) : null}
                  {footer ? <View style={styles.footer}>{footer}</View> : null}
                </Animated.View>
              </Animated.View>
            </View>
          </KeyboardAvoidingView>
        </KeyboardAccessoryContext>
        <ToastOutlet active={visible} />
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = createStyles((t) => ({
  fill: { flex: 1 },
  room: { flex: 1, justifyContent: 'flex-end' },
  // Taller than the room (the keyboard is up): the sheet, then its content, shrink; the content scrolls.
  shrink: { flexShrink: 1 },
  scrim: { backgroundColor: t.colors.scrim },
  sheet: {
    flexShrink: 1,
    backgroundColor: t.colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.lg,
  },
  handleArea: { paddingTop: space.sm, paddingBottom: space.sm, alignItems: 'center' },
  handle: {
    width: size.sheetHandle,
    height: size.sheetHandleHeight,
    borderRadius: radius.full,
    backgroundColor: t.colors.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingLeft: layout.screenMargin,
    paddingRight: layout.screenMargin - space.md,
    paddingBottom: space.lg,
  },
  headerText: { flex: 1, gap: space.xs, paddingTop: space.sm },
  headerAction: { paddingTop: space.xs },
  scrollArea: { flexShrink: 1 },
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: layout.screenMargin, paddingBottom: space.xl, gap: space.xxl },
  footer: { paddingHorizontal: layout.screenMargin, paddingTop: space.sm, gap: space.sm },
}));
