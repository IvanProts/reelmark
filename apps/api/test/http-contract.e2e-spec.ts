import { BadGatewayException, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { type AuthTokens, DeckResponseSchema, type Locale } from '@reelmark/shared';

import { AppModule } from '../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import { TmdbClient } from '../src/tmdb/tmdb.client.js';
import type { TmdbDiscoverResponse, TmdbMovie } from '../src/tmdb/tmdb.schemas.js';
import { bearer, resetDatabase, signIn } from './support/database.js';

/**
 * The public HTTP contract: routes, query parameters, response bodies and the
 * ApiError shape. TmdbClient is replaced by an in-memory fake, so these tests
 * never touch the network; the env for the app under test is set in
 * vitest.config.e2e.ts.
 */

function tmdbMovie(id: number, overrides: Partial<TmdbMovie> = {}): TmdbMovie {
  return {
    id,
    title: `Movie ${id}`,
    overview: 'Plot',
    poster_path: `/poster${id}.jpg`,
    release_date: '2021-06-01',
    vote_average: 7.26,
    genre_ids: [27, 999],
    ...overrides,
  };
}

/**
 * Stands in for TmdbClient with canned data. In Ukrainian, movie 3 has no
 * overview (common on TMDB), so a `uk` deck has to borrow the English one.
 */
class FakeTmdbClient {
  discoverMovies = vi.fn((page: number, locale: Locale): Promise<TmdbDiscoverResponse> =>
    Promise.resolve({
      page,
      total_pages: 9000,
      results: [
        tmdbMovie(1, { overview: locale === 'uk' ? 'Опис' : 'Plot' }),
        tmdbMovie(2, { poster_path: null }),
        tmdbMovie(3, { overview: locale === 'uk' ? '' : 'Plot 3' }),
      ],
    }),
  );

  getMovieGenres = vi.fn((locale: Locale) =>
    Promise.resolve(new Map([[27, locale === 'uk' ? 'Жахи' : 'Horror']])),
  );
}

let app: NestExpressApplication;
let tmdb: FakeTmdbClient;
let session: AuthTokens;

/** An authenticated GET, as the app sends it. */
function get(path: string): request.Test {
  return request(app.getHttpServer()).get(path).set(bearer(session));
}

beforeAll(async () => {
  tmdb = new FakeTmdbClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TmdbClient)
    .useValue(tmdb)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_OPTIONS, logger: false });
  configureApp(app);
  await app.init();
  await resetDatabase(app);
  session = await signIn(app);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/movies/deck', () => {
  it('requires an access token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/movies/deck').expect(401);

    expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized' });
    expect(tmdb.discoverMovies).not.toHaveBeenCalled();
  });

  it('returns a deck that matches DeckResponseSchema', async () => {
    const res = await get('/api/v1/movies/deck').expect(200);

    const deck = DeckResponseSchema.parse(res.body);
    expect(deck.page).toBe(1); // default page
    expect(deck.totalPages).toBe(500); // capped
    expect(deck.items.map((card) => card.id)).toEqual([1, 3]); // no poster → dropped
    expect(deck.items[0]).toEqual({
      id: 1,
      title: 'Movie 1',
      year: 2021,
      overview: 'Plot',
      posterUrl: 'https://image.tmdb.org/t/p/w780/poster1.jpg',
      rating: 7.3,
      genres: ['Horror'],
    });
    // The default language is English, so there is no overview fallback call.
    expect(tmdb.discoverMovies.mock.calls).toEqual([[1, 'en']]);
    expect(tmdb.getMovieGenres).toHaveBeenCalledWith('en');
  });

  it('passes the validated page to TMDB', async () => {
    await get('/api/v1/movies/deck?page=42').expect(200);

    expect(tmdb.discoverMovies).toHaveBeenCalledWith(42, 'en');
  });

  it('serves lang=uk and fills missing overviews from the English page', async () => {
    const res = await get('/api/v1/movies/deck?page=4&lang=uk').expect(200);

    const deck = DeckResponseSchema.parse(res.body);
    expect(deck.items.map(({ overview, genres }) => ({ overview, genres }))).toEqual([
      { overview: 'Опис', genres: ['Жахи'] },
      { overview: 'Plot 3', genres: ['Жахи'] }, // borrowed from English
    ]);
    expect(tmdb.discoverMovies.mock.calls).toEqual([
      [4, 'uk'],
      [4, 'en'], // the single fallback call
    ]);
    expect(tmdb.getMovieGenres).toHaveBeenCalledWith('uk');
  });

  it('serves lang=en without a fallback call', async () => {
    const res = await get('/api/v1/movies/deck?lang=en').expect(200);

    expect(DeckResponseSchema.parse(res.body).items[0]?.genres).toEqual(['Horror']);
    expect(tmdb.discoverMovies.mock.calls).toEqual([[1, 'en']]);
  });

  it('ignores unknown query parameters', async () => {
    const res = await get('/api/v1/movies/deck?page=2&foo=bar&__proto__[x]=1&sort_by=evil').expect(
      200,
    );

    expect(DeckResponseSchema.parse(res.body).page).toBe(2);
    expect(tmdb.discoverMovies).toHaveBeenCalledWith(2, 'en');
  });

  // One example per kind of invalid input; the security suite covers many more.
  it.each([
    ['page=0', 'Invalid request. page: Too small: expected number to be >=1'],
    ['page=0x10', 'Invalid request. page: Invalid input'],
    ['lang=ru', 'Invalid request. lang: Invalid option: expected one of "uk"|"en"'],
  ])('rejects %s with 400 and a message naming the field', async (query, message) => {
    const res = await get(`/api/v1/movies/deck?${query}`).expect(400);

    expect(res.body).toEqual({ statusCode: 400, message });
    expect(tmdb.discoverMovies).not.toHaveBeenCalled();
  });

  it('answers 502 with a generic message when TMDB fails', async () => {
    tmdb.discoverMovies.mockRejectedValueOnce(new BadGatewayException('TMDB request failed'));

    const res = await get('/api/v1/movies/deck').expect(502);

    expect(res.body).toEqual({ statusCode: 502, message: 'Bad Gateway' });
  });

  it('serves the deck without genre names when the genre list fails', async () => {
    tmdb.getMovieGenres.mockRejectedValueOnce(new BadGatewayException('TMDB request failed'));

    const res = await get('/api/v1/movies/deck').expect(200);

    const deck = DeckResponseSchema.parse(res.body);
    expect(deck.items.length).toBeGreaterThan(0);
    expect(deck.items.every((card) => card.genres.length === 0)).toBe(true);
  });

  it('answers 500 for unexpected errors and logs the details server-side only', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error');
    tmdb.discoverMovies.mockRejectedValueOnce(new Error('db password is hunter2'));

    const res = await get('/api/v1/movies/deck?page=1&note=QUERY_MARKER_7c1').expect(500);

    expect(res.body).toEqual({ statusCode: 500, message: 'Internal Server Error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    const logged = logError.mock.calls.flat().join('\n');
    expect(logged).toContain('hunter2');
    // The log line names the route by its path only, never the query string.
    expect(logged).toContain('GET /api/v1/movies/deck -> 500');
    expect(logged).not.toContain('QUERY_MARKER_7c1');
    logError.mockRestore();
  });
});

describe('GET /api/v1/health', () => {
  it('returns { status: "ok" } without an access token', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok' });
  });
});

describe('Unknown routes', () => {
  it('answer 404 with the ApiError body', async () => {
    const res = await get('/api/v1/nope').expect(404);

    expect(res.body).toEqual({ statusCode: 404, message: 'Not Found' });
  });
});
