import { BadGatewayException } from '@nestjs/common';

import type { Locale } from '@reelmark/shared';

import type { CatalogService } from '../catalog/catalog.service.js';
import type { DecisionsService } from '../decisions/decisions.service.js';
import type { TmdbClient } from '../tmdb/tmdb.client.js';
import type { TmdbDiscoverResponse, TmdbMovie } from '../tmdb/tmdb.schemas.js';
import { MoviesService } from './movies.service.js';

function tmdbMovie(id: number, overview: string, poster = true): TmdbMovie {
  return {
    id,
    title: `Movie ${id}`,
    overview,
    poster_path: poster ? `/p${id}.jpg` : null,
    release_date: '2020-01-01',
    vote_average: 7,
    genre_ids: [27],
  };
}

function page(results: TmdbMovie[]): TmdbDiscoverResponse {
  return { page: 3, total_pages: 10, results };
}

const USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * MoviesService with stand-ins: a TmdbClient with one canned discover page per locale, a catalog
 * that records what it was asked to save, and decisions for `decided` movie ids.
 */
function fakeTmdb(
  pages: Partial<Record<Locale, TmdbDiscoverResponse>>,
  decided: readonly number[] = [],
) {
  const tmdb = {
    discoverMovies: vi.fn((_page: number, locale: Locale) => {
      const result = pages[locale];
      return result
        ? Promise.resolve(result)
        : Promise.reject(new BadGatewayException('TMDB request failed'));
    }),
    getMovieGenres: vi.fn((locale: Locale) =>
      Promise.resolve(new Map([[27, locale === 'uk' ? 'Жахи' : 'Horror']])),
    ),
  };
  const catalog = {
    saveDiscoverPage: vi.fn((_locale: Locale, _movies: unknown, _english?: unknown) =>
      Promise.resolve(),
    ),
  };
  const decisions = {
    decidedAmong: vi.fn((_userId: string, ids: readonly number[]) =>
      Promise.resolve(new Set(ids.filter((id) => decided.includes(id)))),
    ),
  };
  const service = new MoviesService(
    tmdb as unknown as TmdbClient,
    catalog as unknown as CatalogService,
    decisions as unknown as DecisionsService,
  );
  return { tmdb, catalog, decisions, service };
}

describe('MoviesService.getDeck', () => {
  it('passes page and locale through to TMDB', async () => {
    const { tmdb, service } = fakeTmdb({
      uk: page([tmdbMovie(1, 'Опис')]),
    });

    const deck = await service.getDeck(3, 'uk', USER_ID);

    expect(tmdb.discoverMovies).toHaveBeenCalledWith(3, 'uk');
    expect(tmdb.getMovieGenres).toHaveBeenCalledWith('uk');
    expect(deck.items[0]).toMatchObject({ overview: 'Опис', genres: ['Жахи'] });
  });

  it('fills empty overviews from the English page, matched by id', async () => {
    const { tmdb, service } = fakeTmdb({
      uk: page([
        tmdbMovie(1, ''),
        tmdbMovie(2, 'Український опис'),
        tmdbMovie(3, '   '),
        tmdbMovie(4, ''), // not on the English page, so it stays empty
      ]),
      en: page([tmdbMovie(3, 'English 3'), tmdbMovie(1, 'English 1'), tmdbMovie(2, 'English 2')]),
    });

    const deck = await service.getDeck(3, 'uk', USER_ID);

    expect(deck.items.map((card) => card.overview)).toEqual([
      'English 1',
      'Український опис',
      'English 3',
      '',
    ]);
    expect(tmdb.discoverMovies).toHaveBeenCalledTimes(2);
    expect(tmdb.discoverMovies).toHaveBeenLastCalledWith(3, 'en');
  });

  it('keeps empty overviews and still serves the deck when the fallback fails', async () => {
    const { tmdb, service } = fakeTmdb({
      uk: page([tmdbMovie(1, ''), tmdbMovie(2, 'Опис')]),
      // No English page: the fallback call rejects with a 502.
    });

    const deck = await service.getDeck(3, 'uk', USER_ID);

    expect(deck.items.map((card) => card.overview)).toEqual(['', 'Опис']);
    expect(tmdb.discoverMovies).toHaveBeenCalledTimes(2);
  });

  it('makes no fallback call when no card has an empty overview', async () => {
    const { tmdb, service } = fakeTmdb({
      uk: page([
        tmdbMovie(1, 'Опис'),
        tmdbMovie(2, '', false), // empty, but dropped for lack of a poster
      ]),
    });

    await service.getDeck(3, 'uk', USER_ID);

    expect(tmdb.discoverMovies).toHaveBeenCalledTimes(1);
  });

  it('never makes a fallback call for English', async () => {
    const { tmdb, service } = fakeTmdb({ en: page([tmdbMovie(1, '')]) });

    const deck = await service.getDeck(3, 'en', USER_ID);

    expect(deck.items[0]?.overview).toBe('');
    expect(tmdb.discoverMovies).toHaveBeenCalledTimes(1);
  });

  it('serves the deck without genre names when the genre list fails', async () => {
    const { tmdb, service } = fakeTmdb({ en: page([tmdbMovie(1, 'Plot')]) });
    tmdb.getMovieGenres.mockRejectedValueOnce(new BadGatewayException());

    const deck = await service.getDeck(3, 'en', USER_ID);

    expect(deck.items[0]?.genres).toEqual([]);
  });

  it('fails with the discover error when the main page fails', async () => {
    const { service } = fakeTmdb({});

    await expect(service.getDeck(3, 'uk', USER_ID)).rejects.toThrow(BadGatewayException);
  });

  it('leaves out the movies the user has already sorted', async () => {
    const { decisions, service } = fakeTmdb(
      { en: page([tmdbMovie(1, 'Plot'), tmdbMovie(2, 'Plot'), tmdbMovie(3, 'Plot')]) },
      [2],
    );

    const deck = await service.getDeck(3, 'en', USER_ID);

    expect(deck.items.map((card) => card.id)).toEqual([1, 3]);
    expect(deck.totalPages).toBe(10);
    expect(decisions.decidedAmong).toHaveBeenCalledWith(USER_ID, [1, 2, 3]);
  });

  it('saves the page to the catalog, with the English page when it was loaded', async () => {
    const uk = page([tmdbMovie(1, ''), tmdbMovie(2, 'Опис')]);
    const en = page([tmdbMovie(1, 'English 1'), tmdbMovie(2, 'English 2')]);
    const { catalog, service } = fakeTmdb({ uk, en }, [1, 2]);

    const deck = await service.getDeck(3, 'uk', USER_ID);

    expect(deck.items).toEqual([]); // both sorted already, yet still saved
    expect(catalog.saveDiscoverPage).toHaveBeenCalledWith('uk', uk.results, en.results);
  });

  it('saves the page without English texts when no fallback was needed', async () => {
    const uk = page([tmdbMovie(1, 'Опис')]);
    const { catalog, service } = fakeTmdb({ uk });

    await service.getDeck(3, 'uk', USER_ID);

    expect(catalog.saveDiscoverPage).toHaveBeenCalledWith('uk', uk.results, []);
  });
});
