import { Injectable, NotFoundException } from '@nestjs/common';

import type { Locale, MovieDetails, Region } from '@reelmark/shared';

import { CatalogService } from '../catalog/catalog.service.js';
import { AsyncCache } from '../common/async-cache.js';
import { TmdbClient } from '../tmdb/tmdb.client.js';
import { WikidataClient } from '../wikidata/wikidata.client.js';
import { isBlank } from './movie-card.mapper.js';
import { type TmdbDetailsPart, toTmdbDetailsPart, toTmdbMovie } from './movie-details.mapper.js';

/** Details change rarely; watch offers may lag a day behind. */
export const DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** An entry is a few KB. */
export const DETAILS_CACHE_MAX_ENTRIES = 1000;

/** TMDB has an English overview for almost every movie. */
const OVERVIEW_FALLBACK_LOCALE: Locale = 'en';

/** Builds the movie details sheet from TMDB (one call per language) and Wikidata. */
@Injectable()
export class MovieDetailsService {
  // Cached values are shared between requests: never mutate them.
  private readonly cache = new AsyncCache<TmdbDetailsPart>({
    ttlMs: DETAILS_CACHE_TTL_MS,
    maxEntries: DETAILS_CACHE_MAX_ENTRIES,
  });

  constructor(
    private readonly tmdb: TmdbClient,
    private readonly wikidata: WikidataClient,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Details of any movie in `locale` for `region`. Fails with a 404 when TMDB has no such movie
   * (or it has no usable poster) and with TmdbClient's 502 when TMDB fails; the English overview
   * fallback and the critics' scores are best effort.
   */
  async getDetails(movieId: number, locale: Locale, region: Region): Promise<MovieDetails> {
    const [details, critics] = await Promise.all([
      this.withOverview(movieId, locale, region),
      this.wikidata.getCriticsScores(movieId),
    ]);
    return { ...details, critics };
  }

  /**
   * When the overview is blank, the English version of the same call supplies it (cached like any
   * other). If that fails too, the overview stays blank.
   */
  private async withOverview(
    movieId: number,
    locale: Locale,
    region: Region,
  ): Promise<TmdbDetailsPart> {
    const details = await this.cached(movieId, locale, region);
    if (locale === OVERVIEW_FALLBACK_LOCALE || !isBlank(details.movie.overview)) {
      return details;
    }
    try {
      const english = await this.cached(movieId, OVERVIEW_FALLBACK_LOCALE, region);
      return isBlank(english.movie.overview)
        ? details
        : { ...details, movie: { ...details.movie, overview: english.movie.overview } };
    } catch {
      return details; // TmdbClient has logged a failure; a 404 needs no log
    }
  }

  /** TMDB data per movie, language and region, for 24 hours. Failures are not cached. */
  private cached(movieId: number, locale: Locale, region: Region): Promise<TmdbDetailsPart> {
    return this.cache.get(`${movieId}:${locale}:${region}`, () =>
      this.load(movieId, locale, region),
    );
  }

  /**
   * Loads and maps the details, and saves the movie with its texts in `locale` to the catalog, so
   * a decision can follow even for a movie that was never in a deck.
   */
  private async load(movieId: number, locale: Locale, region: Region): Promise<TmdbDetailsPart> {
    const tmdbDetails = await this.tmdb.getMovieDetails(movieId, locale);
    const details = toTmdbDetailsPart(tmdbDetails, locale, region);
    if (!details) {
      throw new NotFoundException();
    }
    await this.catalog.saveMovie(locale, toTmdbMovie(tmdbDetails));
    return details;
  }
}
