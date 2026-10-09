import { StyleSheet } from 'react-native';

import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { I18nProvider } from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { colors, navigationTheme, radii } from '@/theme';

/** Root layout: app-wide providers and the stack navigator. */
export default function RootLayout() {
  return (
    // react-native-gesture-handler needs one root view above every gesture.
    <GestureHandlerRootView style={styles.root}>
      {/* Server-data cache used by `useQuery` / `useInfiniteQuery` hooks. */}
      <QueryClientProvider client={queryClient}>
        {/* UI language + `t()` for every screen (see src/i18n). */}
        <I18nProvider>
          <ThemeProvider value={navigationTheme}>
            {/* Light status-bar icons on our dark background. */}
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen
                name="about"
                options={{
                  // A bottom sheet that is exactly as tall as its content.
                  presentation: 'formSheet',
                  sheetAllowedDetents: 'fitToContents',
                  sheetGrabberVisible: true,
                  sheetCornerRadius: radii.sheet,
                  contentStyle: { backgroundColor: colors.surface },
                }}
              />
            </Stack>
          </ThemeProvider>
        </I18nProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
