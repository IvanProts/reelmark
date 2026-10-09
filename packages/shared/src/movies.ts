import { z } from 'zod';

import { intParam } from './primitives.js';

/**
 * Languages the app supports — for both UI copy and movie data.
 * Adding a language = add its code here, a UI translation file in the app,
 * and its TMDB language tag in the API.
 */
export const SUPPORTED_LOCALES = ['uk', 'en'] as const;
export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;
/** Used when the device language isn't supported. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * One card in the swipe deck. This is OUR shape — the API never forwards
 * raw TMDB responses, so the app doesn't depend on a third party's format.
 */
export const MovieCardSchema = z.object({
  /** TMDB movie id. */
  id: z.number().int().positive(),
  title: z.string(),
  /** Release year, null when TMDB has no release date. */
  year: z.number().int().nullable(),
  /** In the requested language; may be "" when no description exists at all. */
  overview: z.string(),
  /** Absolute HTTPS URL of the poster image, always on TMDB's image CDN. */
  posterUrl: z.url({ protocol: /^https$/, hostname: /^image\.tmdb\.org$/ }),
  /** TMDB average vote, 0–10. */
  rating: z.number().min(0).max(10),
  /** Genre names in the requested language, e.g. ["Жахи", "Трилер"]. */
  genres: z.array(z.string()),
});
export type MovieCard = z.infer<typeof MovieCardSchema>;

/** TMDB serves at most 500 pages. */
export const MAX_DECK_PAGE = 500;

/**
 * Query of `GET /api/v1/movies/deck`. Unknown keys are stripped. The deck
 * excludes movies the signed-in user has already sorted.
 */
export const DeckQuerySchema = z.object({
  page: intParam(1, MAX_DECK_PAGE).default(1),
  lang: LocaleSchema.default(DEFAULT_LOCALE),
});
export type DeckQuery = z.infer<typeof DeckQuerySchema>;

/** Response of `GET /api/v1/movies/deck`. */
export const DeckResponseSchema = z.object({
  page: z.number().int().min(1),
  totalPages: z.number().int().min(0),
  items: z.array(MovieCardSchema),
});
export type DeckResponse = z.infer<typeof DeckResponseSchema>;
