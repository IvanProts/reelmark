import { DarkTheme, type Theme } from 'expo-router';

import { colors } from './colors';

/**
 * Theme for Expo Router's navigators (stack backgrounds, headers, sheets).
 * Without it, screen transitions briefly flash the default dark-gray colors.
 */
export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};
