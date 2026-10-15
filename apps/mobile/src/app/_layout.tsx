import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { resetUserData, useMe } from '@/hooks/use-profile';
import { I18nProvider } from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { onSessionReplaced } from '@/lib/session';
import { colors, navigationTheme, radii } from '@/theme';

/** Longest the splash screen waits for the profile before showing the app anyway. */
const MAX_SPLASH_MS = 3000;

/** A deep link to a sheet (e.g. /movie/603) opens it over the tabs, so closing it lands there. */
export const unstable_settings = { initialRouteName: '(tabs)' };

// Keep the splash screen up until the profile (and so the saved language) is known.
void SplashScreen.preventAutoHideAsync();

const sheetOptions = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  sheetGrabberVisible: true,
  sheetCornerRadius: radii.sheet,
  contentStyle: { backgroundColor: colors.surface },
} as const;

const playerOptions = {
  presentation: 'fullScreenModal',
  contentStyle: { backgroundColor: colors.background },
} as const;

/** Root layout: app-wide providers and the stack navigator. */
export default function RootLayout() {
  return (
    // react-native-gesture-handler needs one root view above every gesture.
    <GestureHandlerRootView style={styles.root}>
      {/* Server-data cache used by `useQuery` / `useInfiniteQuery` hooks. */}
      <QueryClientProvider client={queryClient}>
        <ProfileProvider>
          <ThemeProvider value={navigationTheme}>
            {/* Light status-bar icons on our dark background. */}
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="about" options={sheetOptions} />
              <Stack.Screen name="movie/[id]" options={sheetOptions} />
              <Stack.Screen name="trailer/[key]" options={playerOptions} />
            </Stack>
          </ThemeProvider>
        </ProfileProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Loads the profile (which also signs in anonymously), applies its saved language and hides
 * the splash screen once that is known.
 */
function ProfileProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useMe();

  useEffect(() => {
    if (!me.isPending) SplashScreen.hide();
  }, [me.isPending]);

  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), MAX_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // The server rejected the stored session and a new account replaced it: drop old data.
  useEffect(() => onSessionReplaced(() => void resetUserData(queryClient)), [queryClient]);

  return <I18nProvider savedLocale={me.data?.locale ?? null}>{children}</I18nProvider>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
