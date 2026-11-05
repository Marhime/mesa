import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';

import { useToBuyCount } from '@/data';
import { TabBar, type IconName } from '@/ds';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  recipes: { label: 'Recipes', icon: 'file' },
  pantry: { label: 'Pantry', icon: 'list' },
  groceries: { label: 'Groceries', icon: 'store' },
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Tabs.Screen name="pantry" options={{ title: 'Pantry' }} />
      <Tabs.Screen name="groceries" options={{ title: 'Groceries' }} />
    </Tabs>
  );
}

function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const toBuy = useToBuyCount();
  const active = state.routes[state.index]?.key ?? '';
  const items = state.routes.map((route) => ({
    key: route.key,
    label: TABS[route.name]?.label ?? route.name,
    icon: TABS[route.name]?.icon ?? 'home',
    badge: route.name === 'groceries' ? toBuy : undefined,
  }));
  return (
    <TabBar
      items={items}
      activeKey={active}
      onSelect={(key) => {
        const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
        if (key !== active && !event.defaultPrevented) navigateToTab(key);
      }}
    />
  );
}
