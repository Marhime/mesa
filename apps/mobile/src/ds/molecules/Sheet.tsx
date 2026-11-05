import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../atoms/IconButton';
import { Text } from '../atoms/Text';
import { timing } from '../motion';
import { createStyles } from '../theme';
import { duration, layout, radius, shadow, size, space } from '../tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** One line under the title. */
  description?: string;
  children?: ReactNode;
  /** Pinned under the content (primary action). */
  footer?: ReactNode;
}

/** Bottom sheet modal over a scrim. Slides in 375 ms; tap the scrim or × to close. */
export function Sheet({ visible, onClose, title, description, children, footer }: SheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.set(withTiming(1, timing('sheet')));
      return;
    }
    progress.set(withTiming(0, timing('small')));
    const t = setTimeout(() => setMounted(false), duration.small);
    return () => clearTimeout(t);
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.get()) * height }] }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { maxHeight: height - insets.top - space.xxl, paddingBottom: insets.bottom + space.lg }, sheetStyle]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
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
              <IconButton icon="close" variant="plain" accessibilityLabel="Close" onPress={onClose} />
            </View>
          ) : null}
          {children ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>
          ) : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = createStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: t.colors.scrim },
  sheet: {
    backgroundColor: t.colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
    ...shadow.lg,
  },
  handle: {
    alignSelf: 'center',
    width: size.sheetHandle,
    height: size.sheetHandleHeight,
    borderRadius: radius.full,
    backgroundColor: t.colors.line,
    marginBottom: space.sm,
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
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: layout.screenMargin, paddingBottom: space.xl, gap: space.xxl },
  footer: { paddingHorizontal: layout.screenMargin, paddingTop: space.sm, gap: space.sm },
}));
