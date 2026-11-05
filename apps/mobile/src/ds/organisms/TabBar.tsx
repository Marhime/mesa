import { View } from 'react-native';

import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Text } from '../atoms/Text';
import { Touchable } from '../atoms/Touchable';
import { haptics } from '../haptics';
import { useTabBarSpace } from '../layoutHooks';
import { createStyles } from '../theme';
import { border, layout, radius, shadow, size, space } from '../tokens';

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
}

/** Floating pill, 16 pt from the edges. Every tab shows its icon over its label; the active one sits on lime. */
export function TabBar({ items, activeKey, onSelect }: TabBarProps) {
  const styles = useStyles();
  const { bottom } = useTabBarSpace();
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="tablist">
        {items.map((item, i) => {
          const active = item.key === activeKey;
          const badge = item.badge && item.badge > 0 ? `, ${item.badge} to buy` : '';
          return (
            <Touchable
              key={item.key}
              onPress={() => {
                if (!active) haptics.select();
                onSelect(item.key);
              }}
              feedback="scale"
              accessibilityRole="tab"
              accessibilityLabel={`${item.label}${badge}, tab, ${i + 1} of ${items.length}`}
              accessibilityState={{ selected: active }}
              style={[styles.item, active ? styles.active : null]}
            >
              <View>
                <Icon name={item.icon} size="lg" color={active ? 'onTint' : 'inkMuted'} weight={active ? 'duotone' : 'bold'} />
                {item.badge && item.badge > 0 ? (
                  <View style={styles.badge}>
                    <Badge count={item.badge} />
                  </View>
                ) : null}
              </View>
              <Text variant="microStrong" color={active ? 'onTint' : 'inkMuted'} numberOfLines={1}>
                {item.label}
              </Text>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  wrap: { position: 'absolute', left: layout.tabBarEdge, right: layout.tabBarEdge },
  bar: {
    height: size.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.sm,
    gap: space.xs,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceRaised,
    ...shadow.lg,
  },
  item: {
    flex: 1,
    height: size.tabItem,
    alignItems: 'center',
    justifyContent: 'center',
    gap: border.strong,
    borderRadius: radius.full,
    paddingHorizontal: space.xs,
  },
  active: { backgroundColor: t.colors.select },
  badge: { position: 'absolute', top: -space.xs, right: -space.md },
}));
