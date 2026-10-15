import { type ZodType, z } from 'zod';

import { RegionSchema } from '@reelmark/shared';

/**
 * TMDB response shapes, limited to the fields the API uses. TMDB responses are
 * untrusted input: parsing drops undeclared fields, and these types never leave
 * the API (the movies module maps them to the shared contract).
 */

/**
 * The `.max()` limits are far above anything TMDB sends; they keep absurd values
 * (a 1 MB "title") away from users.
 */
const TmdbMovieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().max(500),
  /** "" when TMDB has no description in the requested language. */
  overview: z.string().max(10_000),
  /** e.g. "/kqjL17yufvn9OVLyXYpvtyrFfak.jpg"; missing for some movies. */
  poster_path: z.string().nullish(),
  /** "YYYY-MM-DD"; missing or "" for unreleased movies. */
  release_date: z.string().nullish(),
  vote_average: z.number(),
  genre_ids: z.array(z.number().int()),
});
export type TmdbMovie = z.infer<typeof TmdbMovieSchema>;

/**
 * `GET /discover/movie`, envelope only. The movies inside are validated one by
 * one (see parseMovies), so one malformed movie doesn't fail the whole page.
 */
export const TmdbDiscoverEnvelopeSchema = z.object({
  page: z.number().int().min(1),
  total_pages: z.number().int().min(0),
  results: z.array(z.unknown()),
});

/** A discover page after validation: only well-formed movies. */
export interface TmdbDiscoverResponse {
  page: number;
  total_pages: number;
  results: TmdbMovie[];
}

/** Keeps the movies that match TmdbMovieSchema and counts the dropped rest. */
export function parseMovies(items: readonly unknown[]): {
  movies: TmdbMovie[];
  dropped: number;
} {
  const movies = items.flatMap((item) => {
    const parsed = TmdbMovieSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { movies, dropped: items.length - movies.length };
}

/** `GET /genre/movie/list` */
export const TmdbGenreListSchema = z.object({
  genres: z.array(z.object({ id: z.number().int(), name: z.string().max(100) })),
});

/**
 * A list whose items are validated one by one: malformed items are dropped, and a missing or
 * malformed list counts as empty. For the optional parts of the details response, where one bad
 * video or credit shouldn't cost the whole sheet.
 */
function lenientArray<T>(item: ZodType<T>) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((value) => {
        const parsed = item.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      }),
    );
}

const TmdbVideoSchema = z.object({
  /** Language of the video, e.g. "uk"; null for some uploads. */
  iso_639_1: z.string().max(10).nullish(),
  /** The YouTube video id when `site` is "YouTube"; checked again before it is served. */
  key: z.string().max(100),
  site: z.string().max(50),
  /** "Trailer", "Teaser", "Clip", … */
  type: z.string().max(50),
  official: z.boolean().catch(false),
});
export type TmdbVideo = z.infer<typeof TmdbVideoSchema>;

const TmdbCastSchema = z.object({
  name: z.string().min(1).max(200),
  /** Billing order, 0 = top-billed. */
  order: z.number().int().min(0).catch(Number.MAX_SAFE_INTEGER),
});
export type TmdbCast = z.infer<typeof TmdbCastSchema>;

const TmdbCrewSchema = z.object({
  name: z.string().min(1).max(200),
  job: z.string().max(100),
});
export type TmdbCrew = z.infer<typeof TmdbCrewSchema>;

/** One country's release dates; each may carry an age rating ("" when none). */
const TmdbReleaseDatesSchema = z.object({
  iso_3166_1: z.string().max(10),
  release_dates: lenientArray(z.object({ certification: z.string().max(100) })),
});
export type TmdbReleaseDates = z.infer<typeof TmdbReleaseDatesSchema>;

const TmdbWatchProviderSchema = z.object({
  provider_name: z.string().min(1).max(100),
  logo_path: z.string().nullish(),
  /** Lower comes first. */
  display_priority: z.number().catch(Number.MAX_SAFE_INTEGER),
});
export type TmdbWatchProvider = z.infer<typeof TmdbWatchProviderSchema>;

/** Where-to-watch offers in one country (data by JustWatch). */
const TmdbWatchRegionSchema = z.object({
  /** TMDB's where-to-watch page; checked again before it is served. */
  link: z.string().max(1000).nullish().catch(null),
  /** Included in a subscription. */
  flatrate: lenientArray(TmdbWatchProviderSchema),
  rent: lenientArray(TmdbWatchProviderSchema),
  buy: lenientArray(TmdbWatchProviderSchema),
});
export type TmdbWatchRegion = z.infer<typeof TmdbWatchRegionSchema>;

/**
 * `watch/providers` → region code → offers. Entries with a key that isn't a country code, or with
 * an unexpected shape, are dropped; a missing or malformed section is an empty map.
 */
const TmdbWatchProvidersSchema = z
  .object({ results: z.record(z.string(), z.unknown()) })
  .catch({ results: {} })
  .transform(
    ({ results }): ReadonlyMap<string, TmdbWatchRegion> =>
      new Map(
        Object.entries(results).flatMap(([region, entry]) => {
          const parsed = TmdbWatchRegionSchema.safeParse(entry);
          return RegionSchema.safeParse(region).success && parsed.success
            ? [[region, parsed.data] as const]
            : [];
        }),
      ),
  );

/**
 * `GET /movie/{id}` with `append_to_response=videos,credits,release_dates,watch/providers`. The
 * card fields are strict, as in discover; the appended sections and the extras are lenient, so
 * they degrade to "unknown" instead of failing the request.
 */
export const TmdbMovieDetailsSchema = TmdbMovieSchema.pick({
  id: true,
  title: true,
  overview: true,
  poster_path: true,
  release_date: true,
  vote_average: true,
}).extend({
  /** Genre names in the requested language. */
  genres: lenientArray(z.object({ id: z.number().int(), name: z.string().max(100) })),
  /** Minutes; TMDB sends 0 or null when unknown. */
  runtime: z.number().int().positive().nullish().catch(null),
  tagline: z.string().max(1000).nullish().catch(null),
  videos: z.object({ results: lenientArray(TmdbVideoSchema) }).catch({ results: [] }),
  credits: z
    .object({ cast: lenientArray(TmdbCastSchema), crew: lenientArray(TmdbCrewSchema) })
    .catch({ cast: [], crew: [] }),
  release_dates: z.object({ results: lenientArray(TmdbReleaseDatesSchema) }).catch({ results: [] }),
  'watch/providers': TmdbWatchProvidersSchema,
});
export type TmdbMovieDetails = z.infer<typeof TmdbMovieDetailsSchema>;
