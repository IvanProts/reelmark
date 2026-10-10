import { Injectable } from '@nestjs/common';

import type { Locale } from '@reelmark/shared';

import { ratingFrom, validPosterPath, yearFrom } from '../movies/movie-card.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TmdbMovie } from '../tmdb/tmdb.schemas.js';

interface Translation {
  movieId: number;
  locale: Locale;
  title: string;
  overview: string;
}

/**
 * The movie catalog: TMDB movies the API has served, so decisions can reference them and library
 * pages need no per-movie TMDB calls. It is written only from data the server fetched and
 * validated itself, never from client input.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores the movies of a served discover page with their texts in `locale`. `englishMovies` is
   * the English version of the page, when it was loaded to fill missing overviews; its texts are
   * stored as the English translation. Movies without a usable poster are skipped, as in the deck.
   */
  async saveDiscoverPage(
    locale: Locale,
    movies: readonly TmdbMovie[],
    englishMovies: readonly TmdbMovie[] = [],
  ): Promise<void> {
    // Rows are written in id order, so concurrent saves lock them in the same order and can't
    // deadlock.
    const byId = (a: TmdbMovie, b: TmdbMovie): number => a.id - b.id;
    const servable = movies.filter((movie) => validPosterPath(movie.poster_path)).sort(byId);
    if (servable.length === 0) {
      return;
    }
    const servableIds = new Set(servable.map((movie) => movie.id));
    const english = locale === 'en' ? [] : englishMovies.filter((m) => servableIds.has(m.id));

    const translations: Translation[] = [
      ...servable.map((movie) => translationOf(movie, locale)),
      ...english.sort(byId).map((movie) => translationOf(movie, 'en')),
    ];

    await this.prisma.$transaction([
      ...servable.map((movie) => {
        const data = {
          posterPath: validPosterPath(movie.poster_path) ?? '',
          releaseYear: yearFrom(movie.release_date),
          rating: ratingFrom(movie.vote_average),
          genreIds: movie.genre_ids,
        };
        return this.prisma.movie.upsert({
          where: { id: movie.id },
          create: { id: movie.id, ...data },
          update: data,
        });
      }),
      ...translations.map(({ movieId, locale: textLocale, title, overview }) =>
        this.prisma.movieTranslation.upsert({
          where: { movieId_locale: { movieId, locale: textLocale } },
          create: { movieId, locale: textLocale, title, overview },
          update: { title, overview },
        }),
      ),
    ]);
  }
}

function translationOf(movie: TmdbMovie, locale: Locale): Translation {
  return { movieId: movie.id, locale, title: movie.title, overview: movie.overview };
}
