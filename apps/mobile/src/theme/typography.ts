import type { TextStyle } from 'react-native';

/**
 * Type scale in the platform's system font (SF Pro on iOS, Roboto on Android), so there is
 * no `fontFamily` and no font file to ship. Sizes are in points and follow the user's text
 * size setting; `maxFontScale` caps growth where a layout can't grow (e.g. text on a poster).
 */
export const typography = {
  /** Movie title on a card — big and tight, like a poster. */
  hero: { fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 },
  /** Screen titles. */
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  /** Section and status titles, the wordmark. */
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  /** Button labels. */
  label: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  /** Default reading text. */
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  /** Slightly smaller reading text: movie overview on a card. */
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  /** Metadata: year, rating, counters. */
  caption: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  /** Genre chips, footnotes. */
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.2 },
  /** Swipe stamps on a dragged card ("БАЧИВ"). */
  stamp: { fontSize: 26, lineHeight: 30, fontWeight: '900', letterSpacing: 1.5 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/**
 * Maximum text scale per variant (1 = no growth). Body text may grow a lot;
 * text that lives inside fixed shapes (poster, chips, buttons) grows less so
 * it doesn't get clipped.
 */
export const maxFontScale: Record<TypographyVariant, number> = {
  hero: 1.3,
  title: 1.6,
  headline: 1.5,
  label: 1.35,
  body: 2,
  callout: 1.5,
  caption: 1.5,
  micro: 1.4,
  stamp: 1,
};
