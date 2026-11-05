import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '../layoutHooks';
import { createStyles, useTheme } from '../theme';
import { layout, radius, shadow, space, type SpaceToken } from '../tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Fixed content above the scroll area (TopBar). */
  header?: ReactNode;
  /** Floating content pinned above the tab bar / home indicator (one primary action). */
  footer?: ReactNode;
  /** Put the footer on a raised bar across the bottom (two actions, e.g. "Plan it" · "Cooked!"). */
  footerBar?: boolean;
  /** The floating tab bar is visible: keep content clear of it. */
  tabBar?: boolean;
  scroll?: boolean;
  /** Content starts under the status bar (hero images). */
  fullBleedTop?: boolean;
  /** Center the content vertically (sign-in, empty setups). */
  centered?: boolean;
  gap?: SpaceToken;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** Safe area, surface background, scroll, 20 pt side margins, bottom inset for floating bars. */
export function Screen({
  children,
  header,
  footer,
  footerBar,
  tabBar,
  scroll = true,
  fullBleedTop,
  centered,
  gap = 'xxxl',
  refreshing,
  onRefresh,
}: ScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [footerHeight, setFooterHeight] = useState(0);

  const floorBase = tabBar ? tabSpace.occupied : insets.bottom + space.lg;
  const footerBottom = tabBar ? tabSpace.occupied : Math.max(insets.bottom, space.lg);
  const bottomPad = footerBar ? footerHeight + space.xxl : floorBase + (footer ? footerHeight + space.lg : 0) + space.lg;
  const topPad = fullBleedTop || header ? 0 : insets.top + space.lg;

  const contentStyle = [
    styles.content,
    { paddingTop: topPad, paddingBottom: bottomPad, gap: space[gap] },
    fullBleedTop ? styles.bleed : null,
    centered ? styles.centered : null,
  ];

  return (
    <View style={styles.root}>
      {header ? <View style={fullBleedTop ? styles.overlay : { paddingTop: insets.top }}>{header}</View> : null}
      {scroll ? (
        <ScrollView
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
        </ScrollView>
      ) : (
        <View style={[contentStyle, styles.fill]}>{children}</View>
      )}
      {footer ? (
        <View
          style={footerBar ? [styles.bar, { paddingBottom: Math.max(insets.bottom, space.lg) + space.lg }] : [styles.footer, { bottom: footerBottom }]}
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          pointerEvents="box-none"
        >
          {footer}
        </View>
      ) : null}
    </View>
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
