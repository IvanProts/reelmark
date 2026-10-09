import { Controller, Get, Query } from '@nestjs/common';

import { type DeckQuery, DeckQuerySchema, type DeckResponse } from '@reelmark/shared';

import { MoviesService } from './movies.service.js';

@Controller('movies')
export class MoviesController {
  constructor(private readonly movies: MoviesService) {}

  /** `GET /api/v1/movies/deck?page=N&lang=uk|en`: one page of swipe cards. */
  @Get('deck')
  getDeck(
    // The global validation pipe parses the query with the shared schema, so
    // `page` is a number (default 1) and `lang` a supported locale (default
    // "en"). Invalid input is answered with a 400 before reaching this method.
    @Query({ schema: DeckQuerySchema }) query: DeckQuery,
  ): Promise<DeckResponse> {
    return this.movies.getDeck(query.page, query.lang);
  }
}
