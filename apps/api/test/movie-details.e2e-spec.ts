import { ConsoleLogger, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { type AuthTokens, type MovieDetails, MovieDetailsSchema } from '@reelmark/shared';

import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import type { Env } from '../src/config/env.schema.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { USER_AGENT } from '../src/wikidata/wikidata.client.js';
import { type CapturedOutput, captureOutput } from './support/capture-output.js';
import { bearer, resetDatabase, signIn } from './support/database.js';
import { FakeHttpServer, type Handler, sendJson, sendText } from './support/fake-http-server.js';

/**
 * `GET /api/v1/movies/:movieId/details` through the real TmdbClient, WikidataClient and fetch,
 * against a fake TMDB and a fake Wikidata on 127.0.0.1 (NODE_ENV=test). Neither real service is
 * ever contacted.
 *
 * After every test, afterEach verifies that the token never reaches any output, that TMDB only
 * received body-less GETs of /movie/<id> with the token as a Bearer header, and that Wikidata only
 * received body-less GETs with our User-Agent and no credentials.
 */

const TOKEN = 'details-fake-token-7c1e9a3b5d2f4e6a8b0c';
const TIMEOUT_MS = 400;
const MOVIE_PATH = /^\/3\/movie\/[1-9]\d*$/;
const SPARQL_PATH = '/sparql';
const APPENDS = 'videos,credits,release_dates,watch/providers';
const RT = 'http://www.wikidata.org/entity/Q105584';
const MC = 'http://www.wikidata.org/entity/Q150248';

type Json = Record<string, unknown>;

/** A TMDB details response with every appended section, as TMDB sends it. */
function tmdbDetails(id: number, overrides: Json = {}): Json {
  return {
    id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/poster${id}.jpg`,
    release_date: '1999-10-15',
    vote_average: 8.43,
    genres: [{ id: 18, name: 'Drama' }],
    runtime: 139,
    tagline: 'Mischief. Mayhem. Soap.',
    adult: false, // undeclared fields are dropped
    imdb_id: 'tt0137523',
    videos: {
      results: [
        { iso_639_1: 'en', key: 'teaserKey01', site: 'YouTube', type: 'Teaser', official: true },
        { iso_639_1: 'en', key: 'enTrailer01', site: 'YouTube', type: 'Trailer', official: true },
        { iso_639_1: 'uk', key: 'ukTrailer01', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    credits: {
      cast: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, order) => ({
        name: `Actor ${name}`,
        order,
        character: 'Someone',
      })),
      crew: [
        { name: 'Director One', job: 'Director' },
        { name: 'Writer One', job: 'Screenplay' },
      ],
    },
    release_dates: {
      results: [
        { iso_3166_1: 'UA', release_dates: [{ certification: '', type: 3 }] },
        { iso_3166_1: 'US', release_dates: [{ certification: 'R', type: 3 }] },
      ],
    },
    'watch/providers': {
      results: {
        UA: {
          link: `https://www.themoviedb.org/movie/${id}/watch?locale=UA`,
          flatrate: [{ provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 1 }],
          rent: [{ provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 2 }],
          buy: [{ provider_name: 'Evil', logo_path: 'https://evil.example/x.jpg' }],
        },
        US: { link: 'https://evil.example/watch', flatrate: [] },
      },
    },
    ...overrides,
  };
}

/** What a movie answers in each TMDB language: a body, a handler, or nothing (404). */
type TmdbMovies = Record<string, Json | Handler | undefined>;

/** Fake TMDB: `movies["<id>:<language>"]`; anything else is TMDB's 404. */
function fakeTmdb(movies: TmdbMovies): Handler {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const id = url.pathname.split('/').at(-1);
    const answer = movies[`${id}:${url.searchParams.get('language')}`];
    if (typeof answer === 'function') {
      answer(req, res);
    } else if (answer && MOVIE_PATH.test(url.pathname)) {
      sendJson(res, 200, answer);
    } else {
      sendJson(res, 404, { success: false, status_code: 34, status_message: 'Not found.' });
    }
  };
}

function scoreRow(source: string, value: string, date?: string): Json {
  return {
    source: { type: 'uri', value: source },
    value: { type: 'literal', value },
    ...(date && { date: { type: 'literal', value: date } }),
  };
}

/** Fake Wikidata answering every query with these rows. */
function fakeWikidata(rows: Json[]): Handler {
  return (_req, res) => {
    sendJson(res, 200, {
      head: { vars: ['source', 'value', 'date'] },
      results: { bindings: rows },
    });
  };
}

const SCORE_ROWS = [
  scoreRow(RT, '88%', '2019-01-01T00:00:00Z'),
  scoreRow(RT, '93%', '2024-06-01T00:00:00Z'),
  scoreRow(RT, '7.4/10', '2025-01-01T00:00:00Z'),
  scoreRow(MC, '81/100', '2020-01-01T00:00:00Z'),
];

const hang: Handler = () => undefined;
const fail500: Handler = (_req, res) => sendJson(res, 500, { error: 'upstream-secret-body' });

let tmdb: FakeHttpServer;
let tmdbOrigin: string;
let wikidata: FakeHttpServer;
let wikidataOrigin: string;
let AppModule: Type<unknown>;
let app: NestExpressApplication;
let session: AuthTokens;
let output: CapturedOutput;

const ENV_KEYS = [
  'TMDB_ACCESS_TOKEN',
  'TMDB_BASE_URL',
  'TMDB_TIMEOUT_MS',
  'WIKIDATA_SPARQL_URL',
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

async function createApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  // Safety net: these tests must never talk to the real TMDB or Wikidata.
  const config = moduleRef.get<ConfigService<Env, true>>(ConfigService);
  if (
    !config.get('TMDB_BASE_URL', { infer: true }).startsWith(`${tmdbOrigin}/`) ||
    !config.get('WIKIDATA_SPARQL_URL', { infer: true }).startsWith(`${wikidataOrigin}/`)
  ) {
    throw new Error('Refusing to run: an upstream URL is not the local fake');
  }

  const nestApp = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_OPTIONS,
    logger: new ConsoleLogger({ colors: false }),
  });
  configureApp(nestApp);
  await nestApp.init();
  return nestApp;
}

function getDetails(path: string): request.Test {
  return request(app.getHttpServer()).get(`/api/v1/movies/${path}`).set(bearer(session));
}

function tmdbCalls(): URL[] {
  return tmdb.requests.map((req) => new URL(req.url, tmdbOrigin));
}

/** [path, language] of every TMDB call, in order. */
function tmdbCallSummary(): [string, string | null][] {
  return tmdbCalls().map((url) => [url.pathname, url.searchParams.get('language')]);
}

function details(body: unknown): MovieDetails {
  return MovieDetailsSchema.parse(body);
}

beforeAll(async () => {
  tmdb = new FakeHttpServer(fakeTmdb({}));
  tmdbOrigin = await tmdb.start();
  wikidata = new FakeHttpServer(fakeWikidata([]));
  wikidataOrigin = await wikidata.start();
  process.env.TMDB_ACCESS_TOKEN = TOKEN;
  process.env.TMDB_BASE_URL = `${tmdbOrigin}/3`;
  process.env.TMDB_TIMEOUT_MS = String(TIMEOUT_MS);
  process.env.WIKIDATA_SPARQL_URL = `${wikidataOrigin}${SPARQL_PATH}`;
  // Imported only now: ConfigModule.forRoot() reads process.env while
  // app.module is evaluated.
  ({ AppModule } = await import('../src/app.module.js'));
});

afterAll(async () => {
  await tmdb.stop();
  await wikidata.stop();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

beforeEach(async () => {
  tmdb.reset(fakeTmdb({ '550:en-US': tmdbDetails(550) }));
  wikidata.reset(fakeWikidata(SCORE_ROWS));
  output = captureOutput();
  app = await createApp(); // fresh caches and rate-limit counters
  await resetDatabase(app);
  session = await signIn(app);
});

afterEach(async () => {
  try {
    await app.close();
    const logs = output.text();
    expect(logs).not.toContain(TOKEN);
    expect(logs).not.toContain(session.refreshToken);
    expect(logs).not.toContain('upstream-secret-body');
    for (const req of tmdb.requests) {
      const url = new URL(req.url, tmdbOrigin);
      expect(req.method).toBe('GET');
      expect(url.pathname).toMatch(MOVIE_PATH);
      expect([...url.searchParams.keys()].sort()).toEqual([
        'append_to_response',
        'include_video_language',
        'language',
      ]);
      expect(req.url).not.toContain(TOKEN);
      expect(req.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(req.headers.cookie).toBeUndefined();
      expect(req.body).toBe('');
    }
    for (const req of wikidata.requests) {
      const url = new URL(req.url, wikidataOrigin);
      expect(req.method).toBe('GET');
      expect(url.pathname).toBe(SPARQL_PATH);
      expect([...url.searchParams.keys()].sort()).toEqual(['format', 'query']);
      expect(req.headers['user-agent']).toBe(USER_AGENT);
      expect(req.headers.authorization).toBeUndefined();
      expect(req.headers.cookie).toBeUndefined();
      expect(req.url).not.toContain(TOKEN);
      expect(req.body).toBe('');
    }
  } finally {
    output.restore();
  }
});

describe('Contract', () => {
  it('builds MovieDetails from one TMDB call and one Wikidata query', async () => {
    tmdb.reset(
      fakeTmdb({ '550:uk-UA': tmdbDetails(550, { title: 'Бійцівський клуб', overview: 'Опис' }) }),
    );

    const res = await getDetails('550/details?lang=uk&region=UA')
      .set('X-Forwarded-For', '203.0.113.9')
      .set('Cookie', 'session=client-cookie')
      .expect(200);

    expect(details(res.body)).toEqual({
      movie: {
        id: 550,
        title: 'Бійцівський клуб',
        year: 1999,
        overview: 'Опис',
        posterUrl: 'https://image.tmdb.org/t/p/w780/poster550.jpg',
        rating: 8.4,
        genres: ['Drama'],
      },
      runtime: 139,
      tagline: 'Mischief. Mayhem. Soap.',
      directors: ['Director One'],
      cast: ['Actor A', 'Actor B', 'Actor C', 'Actor D', 'Actor E'],
      certification: { region: 'US', value: 'R' }, // UA has none
      trailer: { youtubeKey: 'ukTrailer01', lang: 'uk' },
      critics: { rottenTomatoes: 93, metacritic: 81 },
      watch: {
        region: 'UA',
        stream: [{ name: 'Netflix', logoUrl: 'https://image.tmdb.org/t/p/w154/netflix.jpg' }],
        rent: [{ name: 'Apple TV', logoUrl: 'https://image.tmdb.org/t/p/w154/apple.jpg' }],
        buy: [],
        link: 'https://www.themoviedb.org/movie/550/watch?locale=UA',
      },
    });
    // Our own shape only: nothing undeclared passes through.
    expect(JSON.stringify(res.body)).not.toMatch(/imdb_id|adult|character|evil/);

    const [call] = tmdbCalls();
    expect(tmdbCalls()).toHaveLength(1);
    expect(call?.pathname).toBe('/3/movie/550');
    expect(call?.searchParams.get('language')).toBe('uk-UA');
    expect(call?.searchParams.get('append_to_response')).toBe(APPENDS);
    expect(call?.searchParams.get('include_video_language')).toBe('uk,en');

    expect(wikidata.requests).toHaveLength(1);
    const query = new URL(wikidata.requests[0]?.url ?? '', wikidataOrigin);
    expect(query.searchParams.get('format')).toBe('json');
    expect(query.searchParams.get('query')).toContain('wdt:P4947 "550"');
    expect(wikidata.requests[0]?.headers.accept).toBe('application/sparql-results+json');
    for (const req of [...tmdb.requests, ...wikidata.requests]) {
      expect(req.headers['x-forwarded-for']).toBeUndefined();
    }
  });

  it('defaults to lang=en and region=US and ignores unknown query parameters', async () => {
    const res = await getDetails('550/details?foo=bar').expect(200);

    const body = details(res.body);
    expect(body.watch).toEqual({ region: 'US', stream: [], rent: [], buy: [], link: null });
    expect(body.trailer).toEqual({ youtubeKey: 'enTrailer01', lang: 'en' });
    expect(body.certification).toEqual({ region: 'US', value: 'R' });
    expect(tmdbCalls()[0]?.searchParams.get('include_video_language')).toBe('en');
  });

  it('requires an access token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/movies/550/details').expect(401);

    expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized' });
    expect(tmdb.requests).toHaveLength(0);
    expect(wikidata.requests).toHaveLength(0);
  });

  it.each([
    '0/details',
    '-1/details',
    'abc/details',
    '07/details',
    '1.5/details',
    '1e3/details',
    `${'9'.repeat(17)}/details`,
    '550/details?region=ua',
    '550/details?region=USA',
    '550/details?region=U1',
    '550/details?region=',
    '550/details?lang=de',
    '550/details?lang=UK',
    '550/details?lang=uk&lang=en',
  ])('answers 400 for %s without calling upstream', async (path) => {
    const res = await getDetails(path).expect(400);

    expect(res.body).toMatchObject({ statusCode: 400, message: expect.any(String) });
    expect(tmdb.requests).toHaveLength(0);
    expect(wikidata.requests).toHaveLength(0);
  });

  it('answers a generic 404 when TMDB has no such movie, and saves nothing', async () => {
    const res = await getDetails('404/details').expect(404);

    expect(res.body).toEqual({ statusCode: 404, message: 'Not Found' });
    expect(tmdbCallSummary()).toEqual([['/3/movie/404', 'en-US']]);
    await request(app.getHttpServer())
      .put('/api/v1/me/decisions/404')
      .set(bearer(session))
      .send({ status: 'want' })
      .expect(404);
  });

  it('answers 404 for a movie without a usable poster', async () => {
    tmdb.reset(
      fakeTmdb({ '550:en-US': tmdbDetails(550, { poster_path: '//evil.example/p.jpg' }) }),
    );

    await getDetails('550/details').expect(404);
  });

  it('answers 502 with a generic message when TMDB fails', async () => {
    tmdb.reset(fakeTmdb({ '550:en-US': fail500 }));

    const res = await getDetails('550/details').expect(502);

    expect(res.body).toEqual({ statusCode: 502, message: 'Bad Gateway' });
    expect(output.text()).toContain('TMDB GET /movie/550 failed: HTTP 500');
  });

  it('answers 502 on a TMDB 401 and logs a hint, never the token', async () => {
    tmdb.reset(fakeTmdb({ '550:en-US': (_req, res) => sendJson(res, 401, {}) }));

    await getDetails('550/details').expect(502);

    expect(output.text()).toContain('check TMDB_ACCESS_TOKEN');
  });
});

describe('Wikidata failures', () => {
  const redirect: Handler = (_req, res) => {
    res.writeHead(302, { location: `${tmdbOrigin}/3/movie/550` });
    res.end();
  };

  it.each<[string, Handler, string]>([
    ['HTTP 500', fail500, 'HTTP 500'],
    ['a redirect', redirect, 'HTTP 302'],
    ['a non-JSON body', (_req, res) => sendText(res, 200, '<html>'), 'not valid JSON'],
    ['an unexpected shape', (_req, res) => sendJson(res, 200, { results: 1 }), 'shape'],
    [
      'an oversized body',
      (_req, res) => sendText(res, 200, 'x'.repeat(300 * 1024)),
      'response too large',
    ],
  ])('serve the details with null scores on %s', async (_label, handler, reason) => {
    wikidata.reset(handler);

    const res = await getDetails('550/details').expect(200);

    expect(details(res.body).critics).toEqual({ rottenTomatoes: null, metacritic: null });
    expect(details(res.body).movie.id).toBe(550);
    expect(output.text()).toContain('Wikidata scores for movie 550 unavailable');
    expect(output.text()).toContain(reason);
    // Never followed: TMDB saw only the details call.
    expect(tmdbCalls()).toHaveLength(1);
  });

  it('serve the details within the timeout when Wikidata hangs, and remember the failure', async () => {
    wikidata.reset(hang);

    const started = Date.now();
    const res = await getDetails('550/details').expect(200);
    expect(Date.now() - started).toBeLessThan(TIMEOUT_MS + 300);
    expect(details(res.body).critics).toEqual({ rottenTomatoes: null, metacritic: null });
    expect(output.text()).toContain(`timed out after ${TIMEOUT_MS} ms`);

    // Another region is a new TMDB call, but the failure is remembered for the movie.
    wikidata.reset(fakeWikidata(SCORE_ROWS));
    const again = await getDetails('550/details?region=UA').expect(200);
    expect(details(again.body).critics).toEqual({ rottenTomatoes: null, metacritic: null });
    expect(wikidata.requests).toHaveLength(0);
    expect(tmdbCalls()).toHaveLength(2);
  });

  it('give null scores when Wikidata has none for the movie', async () => {
    wikidata.reset(fakeWikidata([]));

    const res = await getDetails('550/details').expect(200);

    expect(details(res.body).critics).toEqual({ rottenTomatoes: null, metacritic: null });
  });
});

describe('Caching', () => {
  it('serves a repeated request from memory, keyed by the validated id, lang and region', async () => {
    tmdb.reset(fakeTmdb({ '550:en-US': tmdbDetails(550), '550:uk-UA': tmdbDetails(550) }));

    await getDetails('550/details').expect(200);
    await getDetails('550/details?lang=en&region=US').expect(200);
    await getDetails('550/details?region=US&lang=en&x=1').expect(200);
    expect(tmdbCalls()).toHaveLength(1);

    // Another region or language is another TMDB call; the scores stay cached per movie.
    await getDetails('550/details?region=UA').expect(200);
    await getDetails('550/details?lang=uk&region=UA').expect(200);
    await getDetails('550/details?lang=uk&region=UA').expect(200);
    expect(tmdbCallSummary()).toEqual([
      ['/3/movie/550', 'en-US'],
      ['/3/movie/550', 'en-US'],
      ['/3/movie/550', 'uk-UA'],
    ]);
    expect(wikidata.requests).toHaveLength(1);
  });

  it('shares one TMDB call and one Wikidata query between concurrent first requests', async () => {
    tmdb.reset(
      fakeTmdb({
        '550:en-US': (_req, res) => {
          setTimeout(() => sendJson(res, 200, tmdbDetails(550)), 50);
        },
      }),
    );

    const responses = await Promise.all(Array.from({ length: 5 }, () => getDetails('550/details')));

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    expect(tmdbCalls()).toHaveLength(1);
    expect(wikidata.requests).toHaveLength(1);
  });

  it('does not cache TMDB failures', async () => {
    tmdb.reset(fakeTmdb({ '550:en-US': fail500 }));
    await getDetails('550/details').expect(502);

    tmdb.reset(fakeTmdb({ '550:en-US': tmdbDetails(550) }));
    await getDetails('550/details').expect(200);
    expect(tmdbCalls()).toHaveLength(1);
  });
});

describe('Overview fallback', () => {
  it('fills a blank overview from the English call, then caches both', async () => {
    tmdb.reset(
      fakeTmdb({
        '550:uk-UA': tmdbDetails(550, { title: 'Бійцівський клуб', overview: ' ' }),
        '550:en-US': tmdbDetails(550, { overview: 'English overview' }),
      }),
    );

    const res = await getDetails('550/details?lang=uk').expect(200);
    await getDetails('550/details?lang=uk').expect(200);

    expect(details(res.body).movie).toMatchObject({
      title: 'Бійцівський клуб',
      overview: 'English overview',
    });
    expect(tmdbCallSummary()).toEqual([
      ['/3/movie/550', 'uk-UA'],
      ['/3/movie/550', 'en-US'],
    ]);
  });

  it('keeps the blank overview when the English call fails', async () => {
    tmdb.reset(fakeTmdb({ '550:uk-UA': tmdbDetails(550, { overview: '' }), '550:en-US': fail500 }));

    const res = await getDetails('550/details?lang=uk').expect(200);

    expect(details(res.body).movie.overview).toBe('');
  });
});

describe('Catalog', () => {
  it('saves the movie, so a decision can follow for a movie never seen in a deck', async () => {
    tmdb.reset(
      fakeTmdb({
        '550:uk-UA': tmdbDetails(550, { title: 'Бійцівський клуб', overview: '' }),
        '550:en-US': tmdbDetails(550, { title: 'Fight Club', overview: 'English overview' }),
      }),
    );
    const decide = (): request.Test =>
      request(app.getHttpServer())
        .put('/api/v1/me/decisions/550')
        .set(bearer(session))
        .send({ status: 'want' });

    await decide().expect(404); // not in the catalog yet
    await getDetails('550/details?lang=uk').expect(200);
    await decide().expect(200);

    // Both texts were stored: the Ukrainian one, and the English one that filled its overview.
    const movie = await app.get(PrismaService).movie.findUnique({
      where: { id: 550 },
      include: { translations: { orderBy: { locale: 'asc' } } },
    });
    expect(movie).toMatchObject({
      posterPath: '/poster550.jpg',
      releaseYear: 1999,
      genreIds: [18],
    });
    expect(
      movie?.translations.map(({ locale, title, overview }) => [locale, title, overview]),
    ).toEqual([
      ['en', 'Fight Club', 'English overview'],
      ['uk', 'Бійцівський клуб', ''],
    ]);
  });
});
