import { HttpStatus, Injectable } from '@nestjs/common';

import type { LibraryItem, LibraryPage, LibraryQuery } from '@reelmark/shared';

import { PublicHttpException } from '../common/public-http.exception.js';
import { DB_DECISION_STATUS, toDecision } from '../decisions/decision.mapper.js';
import { catalogMovieToCard } from '../movies/movie-card.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type GenreMap, TmdbClient } from '../tmdb/tmdb.client.js';
import { decodeLibraryCursor, encodeLibraryCursor } from './library-cursor.js';

const NO_GENRES: GenreMap = new Map();

/** The caller's library: seen or want-to-watch movies, newest decision first, from the catalog. */
@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdb: TmdbClient,
  ) {}

  async page(userId: string, query: LibraryQuery): Promise<LibraryPage> {
    const after = query.cursor === undefined ? null : decodeLibraryCursor(query.cursor);
    if (query.cursor !== undefined && !after) {
      throw new PublicHttpException(
        'Invalid request. cursor: Invalid cursor',
        HttpStatus.BAD_REQUEST,
      );
    }

    // One extra row tells whether another page follows.
    const rows = await this.prisma.decision.findMany({
      where: {
        userId,
        status: DB_DECISION_STATUS[query.status],
        ...(after && {
          OR: [
            { updatedAt: { lt: after.updatedAt } },
            { updatedAt: after.updatedAt, movieId: { lt: after.movieId } },
          ],
        }),
      },
      orderBy: [{ updatedAt: 'desc' }, { movieId: 'desc' }],
      take: query.limit + 1,
      include: { movie: { include: { translations: true } } },
    });
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    const nextCursor = rows.length > query.limit && last ? encodeLibraryCursor(last) : null;

    // Genre names are optional, as in the deck.
    const genres =
      pageRows.length > 0
        ? await this.tmdb.getMovieGenres(query.lang).catch(() => NO_GENRES)
        : NO_GENRES;

    // Cards with an unusable poster are dropped, as in the deck; paging continues regardless.
    const items = pageRows.flatMap((row): LibraryItem[] => {
      const movie = catalogMovieToCard(row.movie, query.lang, genres);
      return movie ? [{ movie, decision: toDecision(row) }] : [];
    });
    return { items, nextCursor };
  }
}
