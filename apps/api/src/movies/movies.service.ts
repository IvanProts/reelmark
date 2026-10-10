import { Injectable } from '@nestjs/common';

import type { DeckResponse, Locale } from '@reelmark/shared';

import { CatalogService } from '../catalog/catalog.service.js';
import { DecisionsService } from '../decisions/decisions.service.js';
import { type GenreMap, TmdbClient } from '../tmdb/tmdb.client.js';
import type { TmdbMovie } from '../tmdb/tmdb.schemas.js';
import { fillMissingOverviews, hasMissingOverviews, toDeckResponse } from './movie-card.mapper.js';

const NO_GENRES: GenreMap = new Map();

/** TMDB has an English overview for almost every movie. */
const OVERVIEW_FALLBACK_LOCALE: Locale = 'en';

/** Builds swipe decks from TMDB data. */
@Injectable()
export class MoviesService {
  constructor(
    private readonly tmdb: TmdbClient,
    private readonly catalog: CatalogService,
    private readonly decisions: DecisionsService,
  ) {}

  /**
   * One page of swipe cards in `locale` for a user, without the movies they have already sorted,
   * so a page can hold fewer cards than TMDB's (even none). The page's movies are saved to the
   * catalog first. Fails with the TmdbClient's 502 when the discover page can't be loaded; genre
   * names and overview fallbacks are best effort.
   */
  async getDeck(page: number, locale: Locale, userId: string): Promise<DeckResponse> {
    // Independent requests, so they run in parallel (genres are usually cached).
    const [discover, genres] = await Promise.all([
      this.tmdb.discoverMovies(page, locale),
      // Genre names are optional: if the call fails (TmdbClient has logged
      // why), the deck is still served, with empty genre lists.
      this.tmdb.getMovieGenres(locale).catch(() => NO_GENRES),
    ]);
    const translated = toDeckResponse(discover, genres);
    const english = await this.englishFallback(translated, page, locale);
    const deck = english.length > 0 ? fillMissingOverviews(translated, english) : translated;

    await this.catalog.saveDiscoverPage(locale, discover.results, english);
    const decided = await this.decisions.decidedAmong(
      userId,
      deck.items.map((card) => card.id),
    );
    return { ...deck, items: deck.items.filter((card) => !decided.has(card.id)) };
  }

  /**
   * Many movies have no translated overview. When a card's overview is blank, the English version
   * of the same page supplies it (one extra call, cached like any other page). Returns no movies
   * when it isn't needed or can't be loaded; the cards then keep their blank overview.
   */
  private async englishFallback(
    deck: DeckResponse,
    page: number,
    locale: Locale,
  ): Promise<readonly TmdbMovie[]> {
    if (locale === OVERVIEW_FALLBACK_LOCALE || !hasMissingOverviews(deck)) {
      return [];
    }
    try {
      return (await this.tmdb.discoverMovies(page, OVERVIEW_FALLBACK_LOCALE)).results;
    } catch {
      return []; // TmdbClient has logged the failure
    }
  }
}
