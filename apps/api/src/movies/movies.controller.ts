import { Controller, Get, Param, Query } from '@nestjs/common';

import {
  type DeckQuery,
  DeckQuerySchema,
  type DeckResponse,
  type MovieDetails,
  type MovieDetailsQuery,
  MovieDetailsQuerySchema,
  type MovieIdParams,
  MovieIdParamsSchema,
} from '@reelmark/shared';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { MovieDetailsService } from './movie-details.service.js';
import { MoviesService } from './movies.service.js';

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movies: MoviesService,
    private readonly details: MovieDetailsService,
  ) {}

  /** `GET /api/v1/movies/deck?page=N&lang=uk|en`: one page of swipe cards for the caller. */
  @Get('deck')
  getDeck(
    @CurrentUser() user: AuthUser,
    // The global validation pipe parses the query with the shared schema, so
    // `page` is a number (default 1) and `lang` a supported locale (default
    // "en"). Invalid input is answered with a 400 before reaching this method.
    @Query({ schema: DeckQuerySchema }) query: DeckQuery,
  ): Promise<DeckResponse> {
    return this.movies.getDeck(query.page, query.lang, user.id);
  }

  /**
   * `GET /api/v1/movies/:movieId/details?lang=uk|en&region=UA`: trailer, scores, facts and where
   * to watch for any movie. `lang` defaults to "en" and `region` to "US".
   */
  @Get(':movieId/details')
  getDetails(
    @Param({ schema: MovieIdParamsSchema }) params: MovieIdParams,
    @Query({ schema: MovieDetailsQuerySchema }) query: MovieDetailsQuery,
  ): Promise<MovieDetails> {
    return this.details.getDetails(params.movieId, query.lang, query.region);
  }
}
