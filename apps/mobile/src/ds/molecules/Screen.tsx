import { useState, type ReactNode } from 'react';
import { Platform, RefreshControl, View } from 'react-native';
import Animated, { LayoutAnimationConfig, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardShown } from '../keyboard';
import { KeyboardAccessoryContext } from '../keyboardAccessory';
import { useTabBarSpace } from '../layoutHooks';
import { ScreenScrollContext } from '../screenScroll';
import { createStyles, useTheme } from '../theme';
import { layout, radius, shadow, space, type SpaceToken } from '../tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Fixed content above the scroll area (TopBar). */
  header?: ReactNode;
  /**
   * Floating content pinned above the tab bar / home indicator (one primary action). Off the tabs it is the
   * screen's submit: while a field is typed in, it rides on the keyboard ("Save recipe").
   */
  footer?: ReactNode;
  /** Put the footer on a raised bar across the bottom (two actions, e.g. "Plan it" · "Cooked!"). */
  footerBar?: boolean;
  /** The floating tab bar is visible: keep content clear of it (and of the Mesa button above it). */
  tabBar?: boolean;
  scroll?: boolean;
  /** Content starts under the status bar (hero images). */
  fullBleedTop?: boolean;
  /**
   * Shown as an iOS modal sheet (expo-router `presentation: 'modal'`): the sheet already starts below the
   * status bar, so no top safe area (else the header sits too low).
   */
  modal?: boolean;
  /** Center the content vertically (sign-in, empty setups). */
  centered?: boolean;
  gap?: SpaceToken;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/**
 * Safe area, surface background, scroll, 20 pt side margins, bottom inset for floating bars.
 * Shares its scroll offset (`useScreenScroll`) with the header and content for scroll-linked chrome.
 * What is there as it opens is just there (no entering animation: the screen doesn't pop); what comes later moves in.
 */
export function Screen({
  children,
  header,
  footer,
  footerBar,
  tabBar,
  scroll = true,
  fullBleedTop,
  modal,
  centered,
  gap = 'xxxl',
  refreshing,
  onRefresh,
}: ScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const keyboard = useKeyboardShown();
  // Off the tabs, the footer rides on the keyboard while a field of this screen is typed in (TextField).
  const accessory = footer && !tabBar && !footerBar && Platform.OS === 'ios' ? footer : null;
  const [footerHeight, setFooterHeight] = useState(0);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const floorBase = tabBar ? tabSpace.occupied : insets.bottom + space.lg;
  const footerBottom = tabBar ? tabSpace.occupied : Math.max(insets.bottom, space.lg);
  const bottomPad = footerBar ? footerHeight + space.xxl : floorBase + (footer ? footerHeight + space.lg : 0) + space.lg;
  const topInset = modal ? space.sm : insets.top;
  const topPad = fullBleedTop || header ? 0 : topInset + space.lg;

  const contentStyle = [
    styles.content,
    { paddingTop: topPad, paddingBottom: bottomPad, gap: space[gap] },
    fullBleedTop ? styles.bleed : null,
    centered ? styles.centered : null,
  ];

  return (
    <ScreenScrollContext.Provider value={scrollY}>
      <KeyboardAccessoryContext value={accessory}>
        <LayoutAnimationConfig skipEntering>
          <View style={styles.root}>
            {header ? <View style={fullBleedTop ? styles.overlay : { paddingTop: topInset }}>{header}</View> : null}
            {scroll ? (
              <Animated.ScrollView
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={contentStyle}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                automaticallyAdjustKeyboardInsets
                contentInsetAdjustmentBehavior="never"
                showsVerticalScrollIndicator={false}
                refreshControl={
                  onRefresh ? (
                    <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={theme.colors.inkMuted} />
                  ) : undefined
                }
              >
                {children}
              </Animated.ScrollView>
            ) : (
              <View style={[contentStyle, styles.fill]}>{children}</View>
            )}
            {footer ? (
              <View
                style={footerBar ? [styles.bar, { paddingBottom: Math.max(insets.bottom, space.lg) + space.lg }] : [styles.footer, { bottom: footerBottom }]}
                onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
                pointerEvents="box-none"
                // Behind the keyboard while its copy rides on it: VoiceOver finds one.
                accessibilityElementsHidden={accessory !== null && keyboard}
              >
                {footer}
              </View>
            ) : null}
          </View>
        </LayoutAnimationConfig>
      </KeyboardAccessoryContext>
    </ScreenScrollContext.Provider>
  );
}

const useStyles = createStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  content: { paddingHorizontal: layout.screenMargin, flexGrow: 1 },
  bleed: { paddingHorizontal: 0 },
  centered: { justifyContent: 'center' },
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  footer: { position: 'absolute', left: layout.screenMargin, right: layout.screenMargin },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenMargin,
    paddingTop: space.lg,
    backgroundColor: t.colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.lg,
  },
}));
