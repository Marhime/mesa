import { DarkTheme, DefaultTheme, ThemeProvider, type NativeStackNavigationOptions, type Theme as NavTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TabBarSpaceProvider } from './layoutHooks';
import { ToastProvider } from './molecules/Toast';
import { useTheme } from './theme';

/** Wraps the app: gestures, safe areas, navigation colors, status bar, tab bar space, toasts. */
export function DesignSystemProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const navTheme = useMemo<NavTheme>(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.colors.surface,
        card: theme.colors.surfaceRaised,
        text: theme.colors.ink,
        border: theme.colors.line,
        primary: theme.colors.ink,
        notification: theme.colors.ink,
      },
    };
  }, [theme]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.surface).catch(() => undefined);
  }, [theme]);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <TabBarSpaceProvider>
            <ToastProvider>
              <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
              {children}
            </ToastProvider>
          </TabBarSpaceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Stack options shared by every navigator: no native header (screens use TopBar), surface background. */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const theme = useTheme();
  return useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: theme.colors.surface } }),
    [theme],
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
