import { usePathname, useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';

import { useAskSheets, useBackgroundNews, useMesaWork, useToBuyCount, type NewsHost, type Notify } from '@/data';
import { MesaButton, TabBar, haptics, useToast, type IconName } from '@/ds';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  recipes: { label: 'Recipes', icon: 'recipes' },
  pantry: { label: 'Pantry', icon: 'list' },
  groceries: { label: 'Groceries', icon: 'store' },
};

/** Screens that already show your imports (a toast there would repeat them). */
const SHOWS_IMPORTS = new Set(['/', '/recipes', '/import']);

export default function TabsLayout() {
  useBackgroundNews(useNewsHost());
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Tabs.Screen name="pantry" options={{ title: 'Pantry' }} />
      <Tabs.Screen name="groceries" options={{ title: 'Groceries' }} />
    </Tabs>
  );
}

/** A toast (an error one has its own haptic). */
function useNotify(): Notify {
  const toast = useToast();
  return (message, notice) => toast.show({ message, ...notice });
}

/** Where the app is and how to get places, for the news of work left to Mesa (data/backgroundNews.ts). */
function useNewsHost(): NewsHost {
  const router = useRouter();
  const pathname = usePathname();
  const notify = useNotify();
  const recipeOnScreen = /^\/recipe\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  return {
    screen: {
      importScreen: pathname === '/import',
      importsList: SHOWS_IMPORTS.has(pathname),
      pantry: pathname === '/pantry',
      recipeId: recipeOnScreen,
    },
    notify,
    buzz: (kind) => (kind === 'success' ? haptics.success() : haptics.warning()),
    openRecipe: (id, options) => router.push({ pathname: '/recipe/[id]', params: options?.translated ? { id, translated: '1' } : { id } }),
    openReview: (id) => router.navigate({ pathname: '/pantry', params: { review: id } }),
    openImports: () => router.navigate('/recipes'),
    openScans: () => router.navigate('/pantry'),
  };
}

function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const toBuy = useToBuyCount();
  const sheets = useAskSheets();
  const host = useNewsHost();
  // Mesa on every tab, in the same place: Ask Mesa, or what you asked it for and left to it (tap to open it).
  const working = useMesaWork(host);
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
      accessory={<MesaButton onAsk={sheets.openAsk} working={working} />}
      onSelect={(key) => {
        const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
        if (key !== active && !event.defaultPrevented) navigateToTab(key);
      }}
    />
  );
}
