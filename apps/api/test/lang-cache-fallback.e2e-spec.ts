import { ConsoleLogger, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { type AuthTokens, DeckResponseSchema, type MovieCard } from '@reelmark/shared';

import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import type { Env } from '../src/config/env.schema.js';
import { type CapturedOutput, captureOutput } from './support/capture-output.js';
import { bearer, resetDatabase, signIn } from './support/database.js';
import { FakeHttpServer, type Handler, sendJson } from './support/fake-http-server.js';

/**
 * Languages, the discover and genre caches, and the en-US overview fallback,
 * through the real TmdbClient and fetch against a fake TMDB on 127.0.0.1
 * (NODE_ENV=test). The real TMDB is never contacted.
 *
 * After every test, afterEach verifies that the token never reaches any output
 * and that every upstream request is a body-less GET to one of the two fixed
 * paths, with a TMDB language tag chosen by the API (never client input).
 */

const TOKEN = 'i18n-fake-token-5e8d2c4a6b1f3e7d9c0b';
const TIMEOUT_MS = 400;
const DISCOVER_PATH = '/3/discover/movie';
const GENRES_PATH = '/3/genre/movie/list';
const TMDB_LANGUAGES = ['uk-UA', 'en-US'];

type FakeMovie = Record<string, unknown>;

function movie(id: number, overrides: FakeMovie = {}): FakeMovie {
  return {
    id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/poster${id}.jpg`,
    release_date: '2024-01-01',
    vote_average: 7.4,
    genre_ids: [27],
    ...overrides,
  };
}

function genreList(language: string): object {
  return { genres: [{ id: 27, name: language === 'uk-UA' ? 'Жахи' : 'Horror' }] };
}

/**
 * Fake TMDB whose answers depend on the `language` parameter:
 * `byLanguage[language]` is that language's discover page (or a handler), and
 * `genres[language]` optionally replaces the default genre list.
 */
function fakeTmdb(
  byLanguage: Record<string, FakeMovie[] | Handler>,
  genres: Record<string, Handler> = {},
): Handler {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const language = url.searchParams.get('language') ?? '';
    if (url.pathname === DISCOVER_PATH) {
      const answer = byLanguage[language];
      if (typeof answer === 'function') {
        answer(req, res);
        return;
      }
      sendJson(res, 200, {
        page: Number(url.searchParams.get('page')),
        total_pages: 3,
        results: answer ?? [],
      });
    } else if (url.pathname === GENRES_PATH) {
      const handler = genres[language];
      if (handler) {
        handler(req, res);
        return;
      }
      sendJson(res, 200, genreList(language));
    } else {
      sendJson(res, 404, {});
    }
  };
}

const hang: Handler = () => undefined;
const fail500: Handler = (_req, res) => sendJson(res, 500, {});

let upstream: FakeHttpServer;
let upstreamOrigin: string;
let AppModule: Type<unknown>;
let app: NestExpressApplication;
/** The signed-in test user; deck requests authenticate as them. */
let session: AuthTokens;
let output: CapturedOutput;

const ENV_KEYS = ['TMDB_ACCESS_TOKEN', 'TMDB_BASE_URL', 'TMDB_TIMEOUT_MS'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

async function createApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  // Safety net: these tests must never talk to the real TMDB.
  const baseUrl = moduleRef
    .get<ConfigService<Env, true>>(ConfigService)
    .get('TMDB_BASE_URL', { infer: true });
  if (!baseUrl.startsWith(`${upstreamOrigin}/`)) {
    throw new Error('Refusing to run: TMDB_BASE_URL is not the local fake');
  }

  const nestApp = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_OPTIONS,
    logger: new ConsoleLogger({ colors: false }),
  });
  configureApp(nestApp);
  await nestApp.init();
  return nestApp;
}

function getDeck(query: string): request.Test {
  return request(app.getHttpServer()).get(`/api/v1/movies/deck${query}`).set(bearer(session));
}

function requestsTo(path: string): URL[] {
  return upstream.requests
    .map((req) => new URL(req.url, upstreamOrigin))
    .filter((url) => url.pathname === path);
}

/** [language, page] of every discover call TMDB received, in order. */
function discoverCalls(): [string | null, string | null][] {
  return requestsTo(DISCOVER_PATH).map((url) => [
    url.searchParams.get('language'),
    url.searchParams.get('page'),
  ]);
}

function overviews(body: unknown): string[] {
  return DeckResponseSchema.parse(body).items.map((card: MovieCard) => card.overview);
}

function genresOfFirstCard(body: unknown): string[] | undefined {
  return DeckResponseSchema.parse(body).items[0]?.genres;
}

beforeAll(async () => {
  upstream = new FakeHttpServer(fakeTmdb({}));
  upstreamOrigin = await upstream.start();
  process.env.TMDB_ACCESS_TOKEN = TOKEN;
  process.env.TMDB_BASE_URL = `${upstreamOrigin}/3`;
  process.env.TMDB_TIMEOUT_MS = String(TIMEOUT_MS);
  // Imported only now: ConfigModule.forRoot() reads process.env while
  // app.module is evaluated.
  ({ AppModule } = await import('../src/app.module.js'));
});

afterAll(async () => {
  await upstream.stop();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

beforeEach(async () => {
  output = captureOutput();
  app = await createApp(); // fresh caches and rate-limit counters
  await resetDatabase(app);
  session = await signIn(app);
});

afterEach(async () => {
  try {
    await app.close();
    expect(output.text()).not.toContain(TOKEN);
    expect(output.text()).not.toContain(session.refreshToken);
    for (const req of upstream.requests) {
      const url = new URL(req.url, upstreamOrigin);
      expect(req.method).toBe('GET');
      expect([DISCOVER_PATH, GENRES_PATH]).toContain(url.pathname);
      expect(TMDB_LANGUAGES).toContain(url.searchParams.get('language'));
      expect(req.url).not.toContain(TOKEN);
      expect(req.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(req.headers.cookie).toBeUndefined();
      expect(req.body).toBe('');
    }
  } finally {
    output.restore();
  }
});

describe('Language selection', () => {
  it('asks TMDB for uk-UA texts and genre names, with no fallback when every overview is present', async () => {
    upstream.reset(
      fakeTmdb({
        'uk-UA': [movie(1, { overview: 'Опис 1' }), movie(2, { overview: 'Опис 2' })],
      }),
    );

    const res = await getDeck('?lang=uk').expect(200);

    expect(overviews(res.body)).toEqual(['Опис 1', 'Опис 2']);
    expect(genresOfFirstCard(res.body)).toEqual(['Жахи']);
    expect(
      upstream.requests.map((req) => new URL(req.url, upstreamOrigin).searchParams.get('language')),
    ).toEqual(['uk-UA', 'uk-UA']); // discover + genres only
  });

  it('serves uk and en from separate cache entries, never mixing languages', async () => {
    upstream.reset(
      fakeTmdb({
        'uk-UA': [movie(1, { overview: 'Опис 1' })],
        'en-US': [movie(1, { overview: 'English 1' })],
      }),
    );

    const uk1 = await getDeck('?lang=uk').expect(200);
    const en = await getDeck('?lang=en').expect(200);
    const uk2 = await getDeck('?lang=uk').expect(200);

    expect(overviews(uk1.body)).toEqual(['Опис 1']);
    expect(overviews(en.body)).toEqual(['English 1']);
    expect(overviews(uk2.body)).toEqual(['Опис 1']);
    expect(genresOfFirstCard(uk2.body)).toEqual(['Жахи']);
    expect(genresOfFirstCard(en.body)).toEqual(['Horror']);
    expect(discoverCalls()).toEqual([
      ['uk-UA', '1'],
      ['en-US', '1'],
    ]);
  });
});

describe('Discover cache', () => {
  it('is keyed by the validated page and lang only', async () => {
    upstream.reset(fakeTmdb({ 'uk-UA': [movie(1)], 'en-US': [movie(1)] }));

    // Query order and ignored extra keys don't create new entries.
    await getDeck('?page=3&lang=uk').expect(200);
    await getDeck('?lang=uk&page=3').expect(200);
    await getDeck('?lang=uk&page=3&cachebuster=1').expect(200);
    // The default lang shares the entry with an explicit lang=en.
    await getDeck('?page=2').expect(200);
    await getDeck('?page=2&lang=en').expect(200);
    // Another page or another lang is another entry.
    await getDeck('?page=3').expect(200);

    expect(discoverCalls()).toEqual([
      ['uk-UA', '3'],
      ['en-US', '2'],
      ['en-US', '3'],
    ]);
  });

  it('lets concurrent first requests share one uk call, one en fallback and one genre call', async () => {
    upstream.reset(
      fakeTmdb({
        // Slow enough that all six requests arrive while it is in flight.
        'uk-UA': (_req, res) => {
          setTimeout(() => {
            sendJson(res, 200, {
              page: 2,
              total_pages: 3,
              results: [movie(1, { overview: '' }), movie(2)],
            });
          }, 50);
        },
        'en-US': [movie(1, { overview: 'English 1' }), movie(2)],
      }),
    );

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => getDeck('?page=2&lang=uk')),
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(overviews(res.body)[0]).toBe('English 1');
    }
    expect(discoverCalls()).toEqual([
      ['uk-UA', '2'],
      ['en-US', '2'],
    ]);
    expect(requestsTo(GENRES_PATH)).toHaveLength(1);
  });
});

describe('Genre cache', () => {
  it('fetches the genre list once and serves it from memory afterwards', async () => {
    upstream.reset(fakeTmdb({ 'en-US': [movie(1)] }));

    // Different pages, so each one is a new discover call.
    for (let page = 1; page <= 3; page++) {
      const res = await getDeck(`?page=${page}`).expect(200);
      expect(genresOfFirstCard(res.body)).toEqual(['Horror']);
    }

    expect(requestsTo(DISCOVER_PATH)).toHaveLength(3);
    expect(requestsTo(GENRES_PATH)).toHaveLength(1);
  });

  it('shares one genre request between concurrent first requests', async () => {
    upstream.reset(
      fakeTmdb(
        { 'en-US': [movie(1)] },
        {
          'en-US': (_req, res) => {
            setTimeout(() => sendJson(res, 200, genreList('en-US')), 100);
          },
        },
      ),
    );

    const responses = await Promise.all(Array.from({ length: 5 }, () => getDeck('?lang=en')));

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    expect(requestsTo(GENRES_PATH)).toHaveLength(1);
  });

  it('remembers a failure per locale, so the next request does not retry within 60 s', async () => {
    let enGenreCalls = 0;
    upstream.reset(
      fakeTmdb(
        { 'en-US': [movie(1)], 'uk-UA': [movie(1)] },
        {
          'en-US': (req, res) => {
            enGenreCalls++;
            if (enGenreCalls === 1) {
              fail500(req, res);
            } else {
              sendJson(res, 200, genreList('en-US'));
            }
          },
        },
      ),
    );

    const first = await getDeck('?page=1').expect(200);
    const second = await getDeck('?page=2').expect(200);

    expect(genresOfFirstCard(first.body)).toEqual([]);
    expect(genresOfFirstCard(second.body)).toEqual([]);
    expect(enGenreCalls).toBe(1);

    // The remembered failure is per locale: Ukrainian genre names still load.
    const uk = await getDeck('?page=1&lang=uk').expect(200);
    expect(genresOfFirstCard(uk.body)).toEqual(['Жахи']);
    expect(requestsTo(GENRES_PATH)).toHaveLength(2);
  });
});

describe('Overview fallback', () => {
  it('fills a missing overview from the en-US page with one extra call, then caches both pages', async () => {
    upstream.reset(
      fakeTmdb({
        'uk-UA': [movie(1, { overview: '' }), movie(2, { overview: 'Опис 2' })],
        'en-US': [movie(1, { overview: 'English 1' }), movie(2, { overview: 'English 2' })],
      }),
    );

    const res = await getDeck('?page=4&lang=uk').expect(200);

    expect(overviews(res.body)).toEqual(['English 1', 'Опис 2']);
    expect(discoverCalls()).toEqual([
      ['uk-UA', '4'],
      ['en-US', '4'],
    ]);

    await getDeck('?page=4&lang=uk').expect(200);
    expect(discoverCalls()).toHaveLength(2);
  });

  it('fills by movie id only and never borrows from another or an invalid en movie', async () => {
    upstream.reset(
      fakeTmdb({
        'uk-UA': [
          movie(1, { overview: '' }), // en has it only under another id
          movie(2, { overview: '' }), // en movie 2 is malformed
          movie(3, { overview: '' }), // en overview is absurdly long
          movie(4, { overview: '' }), // en overview is blank too
          movie(5, { overview: '   ' }), // whitespace counts as missing
          movie(6, { overview: 'Опис 6' }), // present: never replaced
        ],
        'en-US': [
          movie(101, { overview: 'Wrong movie 1' }),
          movie(2, { overview: 'Malformed 2', vote_average: null }),
          movie(3, { overview: 'x'.repeat(10_001) }),
          movie(4, { overview: ' \n ' }),
          movie(5, { overview: 'English 5' }),
          movie(6, { overview: 'English 6' }),
        ],
      }),
    );

    const res = await getDeck('?lang=uk').expect(200);

    expect(overviews(res.body)).toEqual(['', '', '', '', 'English 5', 'Опис 6']);
    expect(output.text()).toContain('dropped 2 of 6 movies');
  });

  it('is never used for lang=en, even when overviews are empty', async () => {
    upstream.reset(fakeTmdb({ 'en-US': [movie(1, { overview: '' }), movie(2, { overview: '' })] }));

    await getDeck('?lang=en').expect(200);

    expect(discoverCalls()).toHaveLength(1);
  });

  it('keeps empty overviews and still serves the uk deck when the en fallback fails', async () => {
    upstream.reset(fakeTmdb({ 'uk-UA': [movie(1, { overview: '' })], 'en-US': fail500 }));

    const res = await getDeck('?lang=uk').expect(200);

    expect(overviews(res.body)).toEqual(['']);
    expect(output.text()).toContain('TMDB GET /discover/movie failed: HTTP 500');
  });

  // A failed fallback is not cached, so while the en-US endpoint hangs, every
  // uk request for that page waits TMDB_TIMEOUT_MS and calls TMDB again, even
  // though the uk page itself comes from the cache.
  it('retries a failed en fallback on every uk request', async () => {
    upstream.reset(fakeTmdb({ 'uk-UA': [movie(1, { overview: '' })], 'en-US': hang }));

    for (let i = 0; i < 2; i++) {
      const started = Date.now();
      const res = await getDeck('?lang=uk').expect(200);
      expect(Date.now() - started).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
      expect(overviews(res.body)).toEqual(['']);
    }
    expect(discoverCalls()).toEqual([
      ['uk-UA', '1'],
      ['en-US', '1'],
      ['en-US', '1'],
    ]);
  });

  // TODO(backlog): cache failed English overview fallbacks — see docs/BACKLOG.md
  it.fails('remembers a failed en fallback, so the next uk request is fast', async () => {
    upstream.reset(fakeTmdb({ 'uk-UA': [movie(1, { overview: '' })], 'en-US': hang }));
    await getDeck('?lang=uk').expect(200);

    const started = Date.now();
    await getDeck('?lang=uk').expect(200);

    expect(Date.now() - started).toBeLessThan(TIMEOUT_MS / 2);
    expect(discoverCalls()).toHaveLength(2);
  });
});
