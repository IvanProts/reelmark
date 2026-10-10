import type { DeckResponse, Locale, MovieCard } from '@reelmark/shared';

import type { Movie, MovieTranslation } from '../generated/prisma/client.js';
import type { GenreMap } from '../tmdb/tmdb.client.js';
import type { TmdbDiscoverResponse, TmdbMovie } from '../tmdb/tmdb.schemas.js';

/**
 * Pure functions that build `MovieCard`s, the shared API contract, from validated TMDB data and
 * from catalog rows. No framework code and no I/O.
 */

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w780';

/** TMDB never serves more than 500 pages, whatever `total_pages` says. */
const MAX_TMDB_PAGES = 500;

/**
 * The shape of a TMDB image path, e.g. "/kqjL17yufvn9OVLyXYpvtyrFfak.jpg"
 * (real names are ~27 characters; up to 100 are allowed). Anything else counts
 * as "no poster", so untrusted data can never reshape the image URL.
 */
const POSTER_PATH = /^\/[A-Za-z0-9_-]{1,100}\.(?:jpe?g|png|webp)$/;

const RELEASE_DATE = /^(\d{4})-\d{2}-\d{2}$/;

/** Maps a discover page to a deck, dropping movies that can't become a card. */
export function toDeckResponse(discover: TmdbDiscoverResponse, genres: GenreMap): DeckResponse {
  return {
    page: discover.page,
    totalPages: Math.min(discover.total_pages, MAX_TMDB_PAGES),
    items: discover.results.flatMap((movie) => {
      const card = toMovieCard(movie, genres);
      return card ? [card] : [];
    }),
  };
}

/**
 * Returns a new deck in which cards with a blank overview take the overview of
 * the same movie (matched by id) from `fallback`, e.g. the English version of
 * the page. Cards without a match keep their blank overview.
 */
export function fillMissingOverviews(
  deck: DeckResponse,
  fallback: readonly TmdbMovie[],
): DeckResponse {
  const overviews = new Map(
    fallback.filter((movie) => !isBlank(movie.overview)).map((movie) => [movie.id, movie.overview]),
  );
  return {
    ...deck,
    items: deck.items.map((card) =>
      isBlank(card.overview)
        ? { ...card, overview: overviews.get(card.id) ?? card.overview }
        : card,
    ),
  };
}

/** True when at least one card has a blank overview. */
export function hasMissingOverviews(deck: DeckResponse): boolean {
  return deck.items.some((card) => isBlank(card.overview));
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

/** Returns null for a movie without a usable poster: a swipe card needs one. */
export function toMovieCard(movie: TmdbMovie, genres: GenreMap): MovieCard | null {
  const posterUrl = posterUrlFrom(movie.poster_path);
  if (!posterUrl) {
    return null;
  }
  return {
    id: movie.id,
    title: movie.title,
    year: yearFrom(movie.release_date),
    overview: movie.overview,
    posterUrl,
    rating: ratingFrom(movie.vote_average),
    genres: genreNames(movie.genre_ids, genres),
  };
}

/** A catalog movie with all of its stored translations. */
export type CatalogMovie = Movie & { translations: MovieTranslation[] };

/**
 * Builds a card from the catalog in `locale`. The title falls back to English, then to any stored
 * language; a blank overview falls back to English only. Returns null when the poster is unusable
 * or no translation is stored.
 */
export function catalogMovieToCard(
  movie: CatalogMovie,
  locale: Locale,
  genres: GenreMap,
): MovieCard | null {
  const posterUrl = posterUrlFrom(movie.posterPath);
  const inLocale = movie.translations.find((t) => t.locale === locale);
  const inEnglish = movie.translations.find((t) => t.locale === 'en');
  const title = (inLocale ?? inEnglish ?? movie.translations[0])?.title;
  if (!posterUrl || title === undefined) {
    return null;
  }
  const overview = [inLocale, inEnglish].find((t) => t && !isBlank(t.overview))?.overview ?? '';
  return {
    id: movie.id,
    title,
    year: movie.releaseYear,
    overview,
    posterUrl,
    rating: ratingFrom(movie.rating),
    genres: genreNames(movie.genreIds, genres),
  };
}

/** Genre names for `ids`; ids missing from the genre list are dropped. */
function genreNames(ids: readonly number[], genres: GenreMap): string[] {
  return ids.map((id) => genres.get(id)).filter((name) => name !== undefined);
}

/** The poster path if it has the shape of a TMDB image path, otherwise null. */
export function validPosterPath(posterPath: string | null | undefined): string | null {
  return posterPath && POSTER_PATH.test(posterPath) ? posterPath : null;
}

/** Absolute poster URL, or null when the path is missing or malformed. */
export function posterUrlFrom(posterPath: string | null | undefined): string | null {
  const path = validPosterPath(posterPath);
  return path ? `${POSTER_BASE_URL}${path}` : null;
}

/** "2019-05-30" → 2019; null when missing or not a real date. */
export function yearFrom(releaseDate: string | null | undefined): number | null {
  if (!releaseDate || Number.isNaN(Date.parse(releaseDate))) {
    return null;
  }
  const match = RELEASE_DATE.exec(releaseDate);
  return match ? Number(match[1]) : null;
}

/** Rounded to one decimal and clamped to 0–10. */
export function ratingFrom(voteAverage: number): number {
  const rounded = Math.round(voteAverage * 10) / 10;
  return Math.min(10, Math.max(0, rounded));
}
