import { Injectable } from '@nestjs/common';

import type { DeckResponse, Locale } from '@reelmark/shared';

import { type GenreMap, TmdbClient } from '../tmdb/tmdb.client.js';
import { fillMissingOverviews, hasMissingOverviews, toDeckResponse } from './movie-card.mapper.js';

const NO_GENRES: GenreMap = new Map();

/** TMDB has an English overview for almost every movie. */
const OVERVIEW_FALLBACK_LOCALE: Locale = 'en';

/** Builds swipe decks from TMDB data. */
@Injectable()
export class MoviesService {
  constructor(private readonly tmdb: TmdbClient) {}

  /**
   * One page of swipe cards in `locale`. Fails with the TmdbClient's 502 when
   * the discover page can't be loaded; genre names and overview fallbacks are
   * best effort.
   */
  async getDeck(page: number, locale: Locale): Promise<DeckResponse> {
    // Independent requests, so they run in parallel (genres are usually cached).
    const [discover, genres] = await Promise.all([
      this.tmdb.discoverMovies(page, locale),
      // Genre names are optional: if the call fails (TmdbClient has logged
      // why), the deck is still served, with empty genre lists.
      this.tmdb.getMovieGenres(locale).catch(() => NO_GENRES),
    ]);
    const deck = toDeckResponse(discover, genres);
    return this.withFallbackOverviews(deck, page, locale);
  }

  /**
   * Many movies have no translated overview. Those cards borrow the English one
   * from the same discover page (one extra call, cached like any other page).
   * If that call fails, the cards keep their empty overview.
   */
  private async withFallbackOverviews(
    deck: DeckResponse,
    page: number,
    locale: Locale,
  ): Promise<DeckResponse> {
    if (locale === OVERVIEW_FALLBACK_LOCALE || !hasMissingOverviews(deck)) {
      return deck;
    }
    try {
      const fallback = await this.tmdb.discoverMovies(page, OVERVIEW_FALLBACK_LOCALE);
      return fillMissingOverviews(deck, fallback.results);
    } catch {
      return deck; // TmdbClient has logged the failure
    }
  }
}
