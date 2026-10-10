import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  type AuthTokens,
  DecisionSchema,
  DeckResponseSchema,
  type LibraryPage,
  LibraryPageSchema,
  type Locale,
  MeSchema,
} from '@reelmark/shared';

import { AppModule } from '../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TmdbClient } from '../src/tmdb/tmdb.client.js';
import type { TmdbDiscoverResponse, TmdbMovie } from '../src/tmdb/tmdb.schemas.js';
import { bearer, resetDatabase, signIn } from './support/database.js';

/**
 * A user's own data against the real database: the profile, decisions, the library, the deck's
 * exclusion of sorted movies and the catalog it writes. Two users per test check that no route
 * lets one of them read or change the other's data. TmdbClient is faked.
 */

function tmdbMovie(id: number, locale: Locale, overrides: Partial<TmdbMovie> = {}): TmdbMovie {
  return {
    id,
    title: locale === 'uk' ? `Фільм ${id}` : `Movie ${id}`,
    overview: locale === 'uk' ? `Опис ${id}` : `Overview ${id}`,
    poster_path: `/poster${id}.jpg`,
    release_date: '2020-01-01',
    vote_average: 7,
    genre_ids: [27],
    ...overrides,
  };
}

/**
 * Every page holds movies 1–6. Movie 6 has no poster, so it is never served; movie 2 has no
 * Ukrainian overview, so a `uk` deck borrows the English one.
 */
const fakeTmdb = {
  discoverMovies: (page: number, locale: Locale): Promise<TmdbDiscoverResponse> =>
    Promise.resolve({
      page,
      total_pages: 1,
      results: [
        ...[1, 3, 4, 5].map((id) => tmdbMovie(id, locale)),
        tmdbMovie(2, locale, locale === 'uk' ? { overview: '' } : {}),
        tmdbMovie(6, locale, { poster_path: null }),
      ],
    }),
  getMovieGenres: (locale: Locale) =>
    Promise.resolve(new Map([[27, locale === 'uk' ? 'Жахи' : 'Horror']])),
};

let app: NestExpressApplication;
let prisma: PrismaService;
let alice: AuthTokens;
let bob: AuthTokens;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TmdbClient)
    .useValue(fakeTmdb)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_OPTIONS, logger: false });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(app);
  alice = await signIn(app);
  bob = await signIn(app);
});

function as(user: AuthTokens) {
  const server = app.getHttpServer();
  return {
    get: (path: string) => request(server).get(path).set(bearer(user)),
    put: (path: string, body?: unknown) =>
      request(server)
        .put(path)
        .set(bearer(user))
        .send(body as object),
    patch: (path: string, body?: unknown) =>
      request(server)
        .patch(path)
        .set(bearer(user))
        .send(body as object),
    delete: (path: string) => request(server).delete(path).set(bearer(user)),
  };
}

async function userIdOf(user: AuthTokens): Promise<string> {
  const res = await as(user).get('/api/v1/me').expect(200);
  return MeSchema.parse(res.body).id;
}

/** Serves a deck, which puts its movies into the catalog. */
async function serveDeck(user: AuthTokens, lang: Locale = 'en'): Promise<number[]> {
  const res = await as(user).get(`/api/v1/movies/deck?lang=${lang}`).expect(200);
  return DeckResponseSchema.parse(res.body).items.map((card) => card.id);
}

async function decide(user: AuthTokens, movieId: number, body: object): Promise<void> {
  await as(user).put(`/api/v1/me/decisions/${movieId}`, body).expect(200);
}

async function library(user: AuthTokens, query: string): Promise<LibraryPage> {
  const res = await as(user).get(`/api/v1/me/library?${query}`).expect(200);
  return LibraryPageSchema.parse(res.body);
}

describe('/api/v1/me', () => {
  it('returns the caller’s profile', async () => {
    const res = await as(alice).get('/api/v1/me').expect(200);

    const me = MeSchema.parse(res.body);
    expect(me.locale).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: me.id } })).not.toBeNull();
  });

  it('saves the language choice', async () => {
    const res = await as(alice).patch('/api/v1/me', { locale: 'uk' }).expect(200);

    expect(MeSchema.parse(res.body).locale).toBe('uk');
    expect(MeSchema.parse((await as(alice).get('/api/v1/me')).body).locale).toBe('uk');
  });

  it.each<[string, unknown]>([
    ['an unsupported locale', { locale: 'ru' }],
    ['no locale', {}],
    ['a null locale', { locale: null }],
    ['an array', []],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await as(alice).patch('/api/v1/me', body).expect(400);

    expect(res.body).toEqual({
      statusCode: 400,
      message: expect.stringMatching(/^Invalid request\./),
    });
  });

  it('deletes the account with its decisions and tokens, but keeps the shared catalog', async () => {
    await serveDeck(alice);
    await decide(alice, 1, { status: 'seen', liked: true });
    const id = await userIdOf(alice);

    await as(alice).delete('/api/v1/me').expect(204);

    expect(await prisma.user.count({ where: { id } })).toBe(0);
    expect(await prisma.decision.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.movie.count()).toBeGreaterThan(0);
    await as(alice).get('/api/v1/me').expect(401);
    // Bob is untouched.
    await as(bob).get('/api/v1/me').expect(200);
  });
});

describe('PUT and DELETE /api/v1/me/decisions/:movieId', () => {
  beforeEach(async () => {
    await serveDeck(alice);
  });

  it('saves a decision for a movie served in a deck', async () => {
    const res = await as(alice)
      .put('/api/v1/me/decisions/1', { status: 'seen', liked: true })
      .expect(200);

    expect(DecisionSchema.parse(res.body)).toMatchObject({
      movieId: 1,
      status: 'seen',
      liked: true,
    });
  });

  it('defaults liked to null and replaces the previous decision', async () => {
    await decide(alice, 1, { status: 'seen', liked: false });

    const res = await as(alice).put('/api/v1/me/decisions/1', { status: 'want' }).expect(200);

    expect(DecisionSchema.parse(res.body)).toMatchObject({ status: 'want', liked: null });
    expect(await prisma.decision.count()).toBe(1);
  });

  it('is idempotent: saving the same decision again changes nothing', async () => {
    const first = await as(alice).put('/api/v1/me/decisions/1', { status: 'not_seen' }).expect(200);
    const second = await as(alice)
      .put('/api/v1/me/decisions/1', { status: 'not_seen' })
      .expect(200);

    expect(second.body).toEqual(first.body);
  });

  it('rejects liked for any status but seen', async () => {
    const res = await as(alice)
      .put('/api/v1/me/decisions/1', { status: 'want', liked: true })
      .expect(400);

    expect(res.body).toEqual({
      statusCode: 400,
      message: 'Invalid request. liked: allowed only when status is "seen"',
    });
  });

  it.each<[string, unknown]>([
    ['an unknown status', { status: 'loved' }],
    ['an upper-case status', { status: 'SEEN' }],
    ['no status', {}],
    ['a string liked', { status: 'seen', liked: 'yes' }],
  ])('rejects %s with 400', async (_name, body) => {
    await as(alice).put('/api/v1/me/decisions/1', body).expect(400);
    expect(await prisma.decision.count()).toBe(0);
  });

  it.each(['0', '-1', '1.5', 'abc', '01', '1e3', '2147483648'])(
    'rejects the movie id %s with 400',
    async (movieId) => {
      const res = await as(alice)
        .put(`/api/v1/me/decisions/${movieId}`, { status: 'seen' })
        .expect(400);

      expect(res.body.message).toMatch(/^Invalid request\. movieId: /);
    },
  );

  it('answers 404 for a movie never served in a deck', async () => {
    const res = await as(alice).put('/api/v1/me/decisions/999', { status: 'seen' }).expect(404);

    expect(res.body).toEqual({ statusCode: 404, message: 'Not Found' });
  });

  it('ignores movie data in the body: the catalog holds only server-fetched data', async () => {
    await as(alice)
      .put('/api/v1/me/decisions/1', { status: 'seen', title: 'Injected', posterPath: '/x.jpg' })
      .expect(200);

    const movie = await prisma.movie.findUnique({
      where: { id: 1 },
      include: { translations: true },
    });
    expect(movie?.posterPath).toBe('/poster1.jpg');
    expect(movie?.translations.map((t) => t.title)).toEqual(['Movie 1']);
  });

  it('undoes a decision; undoing again is not an error', async () => {
    await decide(alice, 1, { status: 'seen' });

    await as(alice).delete('/api/v1/me/decisions/1').expect(204);
    await as(alice).delete('/api/v1/me/decisions/1').expect(204);

    expect(await prisma.decision.count()).toBe(0);
  });
});

describe('GET /api/v1/movies/deck for a signed-in user', () => {
  it('stores served movies and their texts in the catalog', async () => {
    await serveDeck(alice, 'uk');

    const movies = await prisma.movie.findMany({
      include: { translations: true },
      orderBy: { id: 'asc' },
    });
    expect(movies.map((movie) => movie.id)).toEqual([1, 2, 3, 4, 5]); // 6 has no poster
    expect(movies[0]).toMatchObject({
      posterPath: '/poster1.jpg',
      releaseYear: 2020,
      rating: 7,
      genreIds: [27],
    });
    // Movie 2's blank Ukrainian overview made the deck load the English page, so English texts
    // are stored too; the Ukrainian overview stays blank, as TMDB has it.
    const texts = (id: number) =>
      movies
        .find((movie) => movie.id === id)
        ?.translations.map((t) => [t.locale, t.title, t.overview])
        .sort();
    expect(texts(1)).toEqual([
      ['en', 'Movie 1', 'Overview 1'],
      ['uk', 'Фільм 1', 'Опис 1'],
    ]);
    expect(texts(2)).toEqual([
      ['en', 'Movie 2', 'Overview 2'],
      ['uk', 'Фільм 2', ''],
    ]);
  });

  it('excludes the movies the caller has sorted, for that caller only', async () => {
    await serveDeck(alice);
    await decide(alice, 1, { status: 'seen' });
    await decide(alice, 2, { status: 'not_seen' });
    await decide(alice, 3, { status: 'want' });

    expect(await serveDeck(alice)).toEqual([4, 5]);
    expect(await serveDeck(bob)).toEqual([1, 3, 4, 5, 2]);
  });

  it('shows a movie again once its decision is undone', async () => {
    await serveDeck(alice);
    await decide(alice, 1, { status: 'seen' });
    await as(alice).delete('/api/v1/me/decisions/1').expect(204);

    expect(await serveDeck(alice)).toContain(1);
  });
});

describe('GET /api/v1/me/library', () => {
  beforeEach(async () => {
    await serveDeck(alice, 'uk');
  });

  it('lists seen and want-to-watch movies separately, newest decision first', async () => {
    await decide(alice, 1, { status: 'seen', liked: true });
    await decide(alice, 2, { status: 'want' });
    await decide(alice, 3, { status: 'seen' });
    await decide(alice, 4, { status: 'not_seen' });

    const seen = await library(alice, 'status=seen');
    const want = await library(alice, 'status=want');

    expect(seen.items.map((item) => item.movie.id)).toEqual([3, 1]);
    expect(seen.items[1]?.decision).toMatchObject({ movieId: 1, status: 'seen', liked: true });
    expect(want.items.map((item) => item.movie.id)).toEqual([2]);
    expect(seen.nextCursor).toBeNull();
  });

  it('pages with an opaque cursor until nextCursor is null', async () => {
    for (const id of [1, 2, 3, 4, 5]) {
      await decide(alice, id, { status: 'seen' });
    }
    const expected = (
      await prisma.decision.findMany({ orderBy: [{ updatedAt: 'desc' }, { movieId: 'desc' }] })
    ).map((row) => row.movieId);

    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await library(alice, `status=seen&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...page.items.map((item) => item.movie.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor !== null);

    expect(seen).toEqual(expected);
    expect(pages).toBe(3);
  });

  it('returns cards in the requested language, with English overviews as the fallback', async () => {
    await decide(alice, 1, { status: 'seen' });
    await decide(alice, 2, { status: 'seen' });

    const uk = await library(alice, 'status=seen&lang=uk');

    expect(uk.items.map(({ movie }) => [movie.title, movie.overview, movie.genres])).toEqual([
      ['Фільм 2', 'Overview 2', ['Жахи']],
      ['Фільм 1', 'Опис 1', ['Жахи']],
    ]);
    const en = await library(alice, 'status=seen&lang=en');
    expect(en.items.map(({ movie }) => [movie.title, movie.overview, movie.genres])).toEqual([
      ['Movie 2', 'Overview 2', ['Horror']],
      ['Movie 1', 'Overview 1', ['Horror']],
    ]);
  });

  it('drops an item whose stored poster is unusable', async () => {
    await decide(alice, 1, { status: 'seen' });
    await decide(alice, 2, { status: 'seen' });
    await prisma.movie.update({ where: { id: 1 }, data: { posterPath: 'javascript:alert(1)' } });

    expect((await library(alice, 'status=seen')).items.map((item) => item.movie.id)).toEqual([2]);
  });

  it.each([
    ['status=not_seen', 'status'],
    ['', 'status'],
    ['status=seen&limit=61', 'limit'],
    ['status=seen&lang=ru', 'lang'],
    ['status=seen&cursor=not-a-cursor', 'cursor'],
    [`status=seen&cursor=${Buffer.from('1.1').toString('base64url')}x`, 'cursor'],
  ])('rejects the query %j with 400 naming %s', async (query, field) => {
    const res = await as(alice).get(`/api/v1/me/library?${query}`).expect(400);

    expect(res.body.message).toMatch(new RegExp(`^Invalid request\\. ${field}: `));
  });
});

describe('Isolation between users', () => {
  beforeEach(async () => {
    await serveDeck(alice);
    await decide(alice, 1, { status: 'seen', liked: true });
    await decide(alice, 2, { status: 'want' });
  });

  it('never shows one user’s library to another', async () => {
    expect((await library(bob, 'status=seen')).items).toEqual([]);
    expect((await library(bob, 'status=want')).items).toEqual([]);
  });

  it('keeps each user’s decision on the same movie separate', async () => {
    await decide(bob, 1, { status: 'not_seen' });
    await as(bob).delete('/api/v1/me/decisions/2').expect(204);

    const aliceSeen = await library(alice, 'status=seen');
    expect(aliceSeen.items[0]?.decision).toMatchObject({ movieId: 1, status: 'seen', liked: true });
    expect((await library(alice, 'status=want')).items.map((item) => item.movie.id)).toEqual([2]);
  });

  it('takes the user only from the token, never from the request', async () => {
    const aliceId = await userIdOf(alice);
    const bobId = await userIdOf(bob);

    await as(bob).put('/api/v1/me/decisions/3', { status: 'seen', userId: aliceId }).expect(200);
    await as(bob).patch('/api/v1/me', { locale: 'uk', id: aliceId }).expect(200);
    const me = await as(bob).get(`/api/v1/me?userId=${aliceId}`).expect(200);

    expect(me.body.id).toBe(bobId);
    expect(
      await prisma.decision.findMany({ where: { movieId: 3 }, select: { userId: true } }),
    ).toEqual([{ userId: bobId }]);
    expect((await prisma.user.findUnique({ where: { id: aliceId } }))?.locale).toBeNull();
  });

  it('deleting one account leaves the other intact', async () => {
    await as(bob).delete('/api/v1/me').expect(204);

    expect((await library(alice, 'status=seen')).items).toHaveLength(1);
  });
});

describe('Request hygiene', () => {
  it('marks every /me response as not storable, errors included', async () => {
    await serveDeck(alice);
    const responses = await Promise.all([
      as(alice).get('/api/v1/me'),
      as(alice).get('/api/v1/me/library?status=seen'),
      as(alice).put('/api/v1/me/decisions/1', { status: 'seen' }),
      as(alice).put('/api/v1/me/decisions/1', { status: 'bad' }),
      request(app.getHttpServer()).get('/api/v1/me'),
    ]);

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 400, 401]);
    for (const res of responses) {
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('rejects a JSON body over 16 KB with 413', async () => {
    await serveDeck(alice);
    const res = await as(alice)
      .put('/api/v1/me/decisions/1', { status: 'seen', padding: 'x'.repeat(16 * 1024) })
      .expect(413);

    expect(res.body).toEqual({ statusCode: 413, message: 'Payload Too Large' });
  });

  it('rejects a form-encoded body with 415', async () => {
    await serveDeck(alice);
    const res = await request(app.getHttpServer())
      .put('/api/v1/me/decisions/1')
      .set(bearer(alice))
      .type('form')
      .send('status=seen')
      .expect(415);

    expect(res.body).toEqual({ statusCode: 415, message: 'Unsupported Media Type' });
    expect(await prisma.decision.count()).toBe(0);
  });
});
