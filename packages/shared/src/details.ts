import { z } from 'zod';

import { DEFAULT_LOCALE, LocaleSchema, MovieCardSchema } from './movies.js';

/**
 * A country as an ISO 3166-1 alpha-2 code, e.g. "UA" or "US". Streaming services and age ratings
 * differ by country, so the app sends the device's region.
 */
export const RegionSchema = z.string().regex(/^[A-Z]{2}$/);
export type Region = z.infer<typeof RegionSchema>;
/** Used when the device reports no region. */
export const DEFAULT_REGION: Region = 'US';

/** Query of `GET /api/v1/movies/:movieId/details`. Unknown keys are stripped. */
export const MovieDetailsQuerySchema = z.object({
  lang: LocaleSchema.default(DEFAULT_LOCALE),
  region: RegionSchema.default(DEFAULT_REGION),
});
export type MovieDetailsQuery = z.infer<typeof MovieDetailsQuerySchema>;

/**
 * A YouTube trailer. Only the video id travels: the app builds the embed URL itself, so the API
 * can never point the player at another site.
 */
export const TrailerSchema = z.object({
  youtubeKey: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  /** The requested language, or English when no trailer exists in it. */
  lang: LocaleSchema,
});
export type Trailer = z.infer<typeof TrailerSchema>;

/** Critics' scores from Wikidata, 0–100; null when Wikidata has none for the movie. */
export const CriticsScoresSchema = z.object({
  /** Rotten Tomatoes Tomatometer: the share of positive reviews, in percent. */
  rottenTomatoes: z.number().int().min(0).max(100).nullable(),
  /** Metacritic Metascore. */
  metacritic: z.number().int().min(0).max(100).nullable(),
});
export type CriticsScores = z.infer<typeof CriticsScoresSchema>;

/** A streaming, rental or purchase service (data by JustWatch, which the app must credit). */
export const WatchProviderSchema = z.object({
  name: z.string().min(1).max(100),
  logoUrl: z.url({ protocol: /^https$/, hostname: /^image\.tmdb\.org$/ }),
});
export type WatchProvider = z.infer<typeof WatchProviderSchema>;

/** Where the movie can be watched in one country. */
export const WatchOptionsSchema = z.object({
  region: RegionSchema,
  /** Included in a subscription. */
  stream: z.array(WatchProviderSchema),
  rent: z.array(WatchProviderSchema),
  buy: z.array(WatchProviderSchema),
  /** TMDB's where-to-watch page for the movie in this country, or null. */
  link: z.url({ protocol: /^https$/, hostname: /^www\.themoviedb\.org$/ }).nullable(),
});
export type WatchOptions = z.infer<typeof WatchOptionsSchema>;

/** Response of `GET /api/v1/movies/:movieId/details`: everything the decision card shows. */
export const MovieDetailsSchema = z.object({
  /** The card itself, so details also work without a card already on screen (deep links). */
  movie: MovieCardSchema,
  /** Minutes; null when unknown. */
  runtime: z.number().int().positive().nullable(),
  /** "" when the movie has none in the requested language. */
  tagline: z.string(),
  directors: z.array(z.string()),
  /** Top-billed actors, at most five. */
  cast: z.array(z.string()).max(5),
  /** Age rating in the region (e.g. "16+", "R"), or in the US when the region has none. */
  certification: z.object({ region: RegionSchema, value: z.string().min(1).max(16) }).nullable(),
  trailer: TrailerSchema.nullable(),
  critics: CriticsScoresSchema,
  watch: WatchOptionsSchema,
});
export type MovieDetails = z.infer<typeof MovieDetailsSchema>;
