import { z } from 'zod';

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
