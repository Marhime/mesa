import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { useTabBarAccessory, useTabBarSpace } from '../layoutHooks';
import { createStyles } from '../theme';
import { border, layout, radius, shadow, size, space } from '../tokens';
import { useSlidingIndicator } from '../useSlidingIndicator';

export interface TabBarItem {
  key: string;
  label: string;
  icon: IconName;
  /** Count shown on the icon (items to buy). */
  badge?: number;
}

export interface TabBarProps {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Floats just above the bar, at its right end, on every tab (MesaButton); screens and toasts keep clear of it. */
  accessory?: ReactNode;
}

/**
 * Floating pill, 16 pt from the edges. Every tab shows its icon over its label; the ink pill slides
 * under the active one. Silent, like iOS tab bars (no haptic). An `accessory` floats 8 pt above it, at
 * its right end; nothing moves as you scroll or change tabs.
 */
export function TabBar({ items, activeKey, onSelect, accessory }: TabBarProps) {
  const styles = useStyles();
  const { bottom } = useTabBarSpace();
  const hasAccessory = accessory != null && accessory !== false;
  useTabBarAccessory(hasAccessory);
  const activeIndex = Math.max(0, items.findIndex((i) => i.key === activeKey));
  const pill = useSlidingIndicator(activeIndex);
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      {hasAccessory ? (
        <View style={styles.accessory} pointerEvents="box-none">
          {accessory}
        </View>
      ) : null}
      <View style={styles.bar}>
        <View style={styles.row} accessibilityRole="tablist">
          <Animated.View style={[styles.pill, pill.indicatorStyle]} pointerEvents="none" />
          {items.map((item, i) => {
            const active = i === activeIndex;
            const badge = item.badge && item.badge > 0 ? `, ${item.badge} to buy` : '';
            return (
              <View key={item.key} style={styles.cell} onLayout={pill.onItemLayout(i)}>
                <Touchable
                  onPress={() => onSelect(item.key)}
                  feedback="scale"
                  accessibilityRole="tab"
                  accessibilityLabel={`${item.label}${badge}`}
                  accessibilityState={{ selected: active }}
                  style={styles.item}
                >
                  <View>
                    <Icon name={item.icon} size="lg" color={active ? 'onSelect' : 'inkMuted'} weight={active ? 'duotone' : 'bold'} />
                    {item.badge && item.badge > 0 ? (
                      <View style={styles.badge}>
                        <Badge count={item.badge} />
                      </View>
                    ) : null}
                  </View>
                  <Text variant="microStrong" color={active ? 'onSelect' : 'inkMuted'} numberOfLines={1} chrome>
                    {item.label}
                  </Text>
                </Touchable>
              </View>
            );
          })}
        </View>
        {/* A hairline edge in dark mode, where the shadow disappears. */}
        <View style={[StyleSheet.absoluteFill, styles.edge]} pointerEvents="none" />
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  wrap: { position: 'absolute', left: layout.tabBarEdge, right: layout.tabBarEdge, gap: space.sm },
  accessory: { height: size.tabAccessory, alignItems: 'flex-end' },
  bar: {
    height: size.tabBar,
    padding: space.sm,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceRaised,
    ...shadow.lg,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pill: { position: 'absolute', top: 0, left: 0, borderRadius: radius.full, backgroundColor: t.colors.select },
  cell: { flex: 1 },
  item: {
    height: size.tabItem,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    borderRadius: radius.full,
    paddingHorizontal: space.xs,
  },
  edge: { borderRadius: radius.full, borderWidth: border.hairline, borderColor: t.colors.floatEdge },
  badge: { position: 'absolute', top: -space.xs, right: -space.md },
}));
