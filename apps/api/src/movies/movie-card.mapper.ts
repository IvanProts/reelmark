import type { DeckResponse, MovieCard } from '@reelmark/shared';

import type { GenreMap } from '../tmdb/tmdb.client.js';
import type { TmdbDiscoverResponse, TmdbMovie } from '../tmdb/tmdb.schemas.js';

/**
 * Pure functions that map validated TMDB data to the shared API contract
 * (`@reelmark/shared`). No framework code and no I/O.
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
    // Genre ids missing from the genre list are dropped.
    genres: movie.genre_ids.map((id) => genres.get(id)).filter((name) => name !== undefined),
  };
}

/** Absolute poster URL, or null when the path is missing or malformed. */
export function posterUrlFrom(posterPath: string | null | undefined): string | null {
  return posterPath && POSTER_PATH.test(posterPath) ? `${POSTER_BASE_URL}${posterPath}` : null;
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
