import { Redirect } from 'expo-router';

/**
 * Unknown routes (e.g. an old or mistyped `reelmark://…` deep link) go to the deck instead of
 * Expo Router's built-in "Unmatched Route" page, which is English-only and echoes the link.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
