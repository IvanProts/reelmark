import { Injectable, NotFoundException } from '@nestjs/common';

import type { Decision, SaveDecision } from '@reelmark/shared';

import { PrismaService } from '../prisma/prisma.service.js';
import { DB_DECISION_STATUS, toDecision } from './decision.mapper.js';

/** One user's decisions. Every method is scoped to the given user id, which callers take from the token. */
@Injectable()
export class DecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Saves a decision, replacing any previous one for the movie. The movie must be in the catalog,
   * i.e. the API has served it in a deck. Saving the same decision again changes nothing, so a
   * retried request doesn't move the movie to the top of the library.
   */
  async save(userId: string, movieId: number, decision: SaveDecision): Promise<Decision> {
    const status = DB_DECISION_STATUS[decision.status];
    const existing = await this.prisma.decision.findUnique({
      where: { userId_movieId: { userId, movieId } },
    });
    if (existing && existing.status === status && existing.liked === decision.liked) {
      return toDecision(existing);
    }

    const movie = await this.prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true },
    });
    if (!movie) {
      throw new NotFoundException();
    }
    const saved = await this.prisma.decision.upsert({
      where: { userId_movieId: { userId, movieId } },
      create: { userId, movieId, status, liked: decision.liked },
      update: { status, liked: decision.liked },
    });
    return toDecision(saved);
  }

  /** Deletes a decision (undo). Deleting one that doesn't exist is not an error. */
  async remove(userId: string, movieId: number): Promise<void> {
    await this.prisma.decision.deleteMany({ where: { userId, movieId } });
  }

  /** The subset of `movieIds` the user has already decided on. */
  async decidedAmong(userId: string, movieIds: readonly number[]): Promise<Set<number>> {
    if (movieIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.decision.findMany({
      where: { userId, movieId: { in: [...movieIds] } },
      select: { movieId: true },
    });
    return new Set(rows.map((row) => row.movieId));
  }
}
