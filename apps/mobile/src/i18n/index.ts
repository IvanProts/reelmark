/**
 * UI translations. To add a language: add its code to `SUPPORTED_LOCALES` in
 * packages/shared, copy `en.ts` to `<code>.ts` and translate it, then register it in
 * `dictionaries` (i18n-provider.tsx). TypeScript reports any missing key.
 */
export { dictionaries, I18nProvider, useI18n } from './i18n-provider';
export type { PlainTranslationKey, TranslateFn } from './types';
