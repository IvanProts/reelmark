import {
  type Locale,
  type MovieDetails,
  type Region,
  type Trailer,
  TrailerSchema,
  type WatchOptions,
  type WatchProvider,
} from '@reelmark/shared';

import type {
  TmdbCast,
  TmdbCrew,
  TmdbMovie,
  TmdbMovieDetails,
  TmdbReleaseDates,
  TmdbVideo,
  TmdbWatchProvider,
  TmdbWatchRegion,
} from '../tmdb/tmdb.schemas.js';
import { toMovieCard, validPosterPath } from './movie-card.mapper.js';

/**
 * Pure functions that build `MovieDetails`, the shared API contract, from validated TMDB data.
 * No framework code and no I/O.
 */

/** Everything but the critics' scores, which come from Wikidata and are cached separately. */
export type TmdbDetailsPart = Omit<MovieDetails, 'critics'>;

const LOGO_BASE_URL = 'https://image.tmdb.org/t/p/w154';
const WATCH_LINK_HOST = 'www.themoviedb.org';
/** Where the age rating comes from when the region has none. */
const FALLBACK_CERTIFICATION_REGION: Region = 'US';
const MAX_CAST = 5;
/** Far above any real movie; keeps the sheet sane if TMDB data is odd. */
const MAX_DIRECTORS = 10;
const MAX_PROVIDERS = 20;
const MAX_CERTIFICATION_LENGTH = 16;
const YOUTUBE_KEY = TrailerSchema.shape.youtubeKey;

/**
 * Maps a TMDB movie with its appended sections to the details of one region. Returns null for a
 * movie without a usable poster: like the deck, the app shows no card without one.
 */
export function toTmdbDetailsPart(
  details: TmdbMovieDetails,
  locale: Locale,
  region: Region,
): TmdbDetailsPart | null {
  const genres = new Map(details.genres.map(({ id, name }) => [id, name]));
  const movie = toMovieCard(toTmdbMovie(details), genres);
  if (!movie) {
    return null;
  }
  return {
    movie,
    runtime: details.runtime ?? null,
    tagline: details.tagline ?? '',
    directors: directorsFrom(details.credits.crew),
    cast: topCast(details.credits.cast),
    certification: certificationFor(details.release_dates.results, region),
    trailer: selectTrailer(details.videos.results, locale),
    watch: watchOptionsFor(details['watch/providers'], region),
  };
}

/** The card fields of a details response, in the shape the catalog stores. */
export function toTmdbMovie(details: TmdbMovieDetails): TmdbMovie {
  return {
    id: details.id,
    title: details.title,
    overview: details.overview,
    poster_path: details.poster_path,
    release_date: details.release_date,
    vote_average: details.vote_average,
    genre_ids: details.genres.map((genre) => genre.id),
  };
}

/**
 * A YouTube trailer: official ones before unofficial ones, each in `locale` first, then in
 * English; within a group, TMDB's order decides. Only ids of the YouTube shape qualify.
 */
export function selectTrailer(videos: readonly TmdbVideo[], locale: Locale): Trailer | null {
  const trailers = videos.filter(
    (video) =>
      video.site === 'YouTube' &&
      video.type === 'Trailer' &&
      YOUTUBE_KEY.safeParse(video.key).success,
  );
  const languages: Locale[] = locale === 'en' ? ['en'] : [locale, 'en'];
  for (const official of [true, false]) {
    for (const lang of languages) {
      const match = trailers.find(
        (video) => video.official === official && video.iso_639_1 === lang,
      );
      if (match) {
        return { youtubeKey: match.key, lang };
      }
    }
  }
  return null;
}

/**
 * The region's age rating: the first non-empty certification among its release dates, falling
 * back to the US. Values longer than the contract allows are skipped.
 */
export function certificationFor(
  countries: readonly TmdbReleaseDates[],
  region: Region,
): MovieDetails['certification'] {
  for (const country of new Set([region, FALLBACK_CERTIFICATION_REGION])) {
    const value = countries
      .find((entry) => entry.iso_3166_1 === country)
      ?.release_dates.map((release) => release.certification.trim())
      .find((text) => text.length > 0 && text.length <= MAX_CERTIFICATION_LENGTH);
    if (value) {
      return { region: country, value };
    }
  }
  return null;
}

/** The top-billed actors by billing order, without duplicates (one actor, two roles). */
export function topCast(cast: readonly TmdbCast[]): string[] {
  const byOrder = [...cast].sort((a, b) => a.order - b.order);
  return unique(byOrder.map((member) => member.name)).slice(0, MAX_CAST);
}

/** Names of the crew members credited as "Director", in TMDB's order. */
export function directorsFrom(crew: readonly TmdbCrew[]): string[] {
  const directors = crew.filter((member) => member.job === 'Director');
  return unique(directors.map((member) => member.name)).slice(0, MAX_DIRECTORS);
}

/** The region's offers; empty lists and no link when TMDB has none for it. */
export function watchOptionsFor(
  regions: ReadonlyMap<string, TmdbWatchRegion>,
  region: Region,
): WatchOptions {
  const offers = regions.get(region);
  return {
    region,
    stream: providersFrom(offers?.flatrate ?? []),
    rent: providersFrom(offers?.rent ?? []),
    buy: providersFrom(offers?.buy ?? []),
    link: watchLinkFrom(offers?.link),
  };
}

/** By display priority; providers without a usable logo are dropped, as are repeated names. */
export function providersFrom(providers: readonly TmdbWatchProvider[]): WatchProvider[] {
  const byPriority = [...providers].sort((a, b) => a.display_priority - b.display_priority);
  const seen = new Set<string>();
  const result: WatchProvider[] = [];
  for (const provider of byPriority) {
    const logoUrl = logoUrlFrom(provider.logo_path);
    if (logoUrl && !seen.has(provider.provider_name)) {
      seen.add(provider.provider_name);
      result.push({ name: provider.provider_name, logoUrl });
    }
  }
  return result.slice(0, MAX_PROVIDERS);
}

/** Absolute logo URL on TMDB's image CDN; logo paths follow the poster path rules. */
export function logoUrlFrom(logoPath: string | null | undefined): string | null {
  const path = validPosterPath(logoPath);
  return path ? `${LOGO_BASE_URL}${path}` : null;
}

/**
 * The link if it is a plain https URL on TMDB's website (no credentials, no port), otherwise
 * null, so untrusted data can never send the app's browser elsewhere.
 */
export function watchLinkFrom(link: string | null | undefined): string | null {
  const url = link ? URL.parse(link) : null;
  const isTmdbPage =
    url?.protocol === 'https:' &&
    url.hostname === WATCH_LINK_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === '';
  return isTmdbPage ? url.href : null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
