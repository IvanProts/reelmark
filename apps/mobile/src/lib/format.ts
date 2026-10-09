/** Locale-aware formatting for movie data. */
import type { Locale } from '@reelmark/shared';

// Creating an Intl.NumberFormat is relatively slow, so keep one per locale.
const ratingFormats = new Map<Locale, Intl.NumberFormat>();

/** 7.834 → "7,8" in Ukrainian (decimal comma), "7.8" in English. */
export function formatRating(rating: number, locale: Locale): string {
  let format = ratingFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    ratingFormats.set(locale, format);
  }
  return format.format(rating);
}

/** TMDB reports 0 for movies nobody has voted on yet; such ratings are hidden. */
export function hasRating(rating: number): boolean {
  return rating > 0;
}
