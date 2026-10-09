import type { Locale } from '@reelmark/shared';

/**
 * App locale → TMDB `language` parameter. Typed as `Record<Locale, string>`, so
 * adding a locale to SUPPORTED_LOCALES in `@reelmark/shared` fails to compile
 * until it is mapped here.
 */
export const TMDB_LANGUAGE: Record<Locale, string> = {
  uk: 'uk-UA',
  en: 'en-US',
};
