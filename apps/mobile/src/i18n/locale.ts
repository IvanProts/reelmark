import { getLocales } from 'expo-localization';

import { DEFAULT_LOCALE, LocaleSchema, type Locale } from '@reelmark/shared';

/**
 * The language the app starts in: the first supported entry in the device's preferred
 * languages (e.g. Polish, then Ukrainian → Ukrainian), otherwise DEFAULT_LOCALE.
 *
 * expo-localization reads the device-wide list. Intl would report only languages the app
 * bundle declares, which is English alone in Expo Go.
 */
export function getDeviceLocale(): Locale {
  for (const { languageCode } of getLocales()) {
    const result = LocaleSchema.safeParse(languageCode?.toLowerCase());
    if (result.success) {
      return result.data;
    }
  }
  return DEFAULT_LOCALE;
}
