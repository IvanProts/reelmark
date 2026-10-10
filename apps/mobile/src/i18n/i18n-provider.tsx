/** React context that holds the UI language and exposes `t()` through `useI18n()`. */
import { createContext, useContext, useState, type ReactNode } from 'react';

import type { Locale } from '@reelmark/shared';

import { en } from './en';
import { getDeviceLocale } from './locale';
import type { Dictionary, TranslateFn } from './types';
import { uk } from './uk';

/** One dictionary per supported locale; a locale without one is a compile error. */
export const dictionaries: Record<Locale, Dictionary> = { uk, en };

type I18nValue = {
  /** The current UI language, e.g. `'uk'`. */
  locale: Locale;
  /** Translates a key into the current language. */
  t: TranslateFn;
  /** Switches the whole app to another language for this session. */
  setLocale: (locale: Locale) => void;
  /** Forgets the in-session choice, falling back to the saved or device language. */
  resetLocale: () => void;
};

const I18nContext = createContext<I18nValue | null>(null);

type I18nProviderProps = {
  /** The language saved to the account, or null when the user hasn't picked one. */
  savedLocale: Locale | null;
  children: ReactNode;
};

/**
 * The UI language is the choice made in this session, else the one saved to the account,
 * else the device language. Mounted once in the root layout.
 */
export function I18nProvider({ savedLocale, children }: I18nProviderProps) {
  const [deviceLocale] = useState(getDeviceLocale);
  const [chosenLocale, setChosenLocale] = useState<Locale | null>(null);
  const locale = chosenLocale ?? savedLocale ?? deviceLocale;

  const t: TranslateFn = (key, ...params) => interpolate(dictionaries[locale][key], params[0]);

  return (
    <I18nContext
      value={{
        locale,
        t,
        setLocale: setChosenLocale,
        resetLocale: () => setChosenLocale(null),
      }}
    >
      {children}
    </I18nContext>
  );
}

/** Current language, `t()` and the language setters for any component under `I18nProvider`. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n() must be used inside <I18nProvider>.');
  return value;
}

/** Fills `{name}` placeholders: ("Hi {name}", { name: "Ivan" }) → "Hi Ivan". */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}
