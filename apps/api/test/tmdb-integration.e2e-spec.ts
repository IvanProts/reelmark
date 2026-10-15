import type { ServerResponse } from 'node:http';

import { BadGatewayException, ConsoleLogger, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { type AuthTokens, type DeckResponse, DeckResponseSchema } from '@reelmark/shared';

import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import type { Env } from '../src/config/env.schema.js';
import { TmdbClient } from '../src/tmdb/tmdb.client.js';
import { type CapturedOutput, captureOutput } from './support/capture-output.js';
import { bearer, resetDatabase, signIn } from './support/database.js';
import { FakeHttpServer, type Handler, sendJson, sendText } from './support/fake-http-server.js';

/**
 * The real TmdbClient and Node's fetch against a fake TMDB on 127.0.0.1
 * (allowed because NODE_ENV=test): what the API sends upstream and how it
 * handles whatever comes back. createApp() refuses to run unless
 * TMDB_BASE_URL points at the fake, so the real TMDB is never contacted.
 *
 * After every test, afterEach verifies that the token never appears in any
 * output and that every upstream request was a body-less GET to one of the two
 * fixed paths, carrying the token only in the Authorization header.
 */

const TOKEN = 'integration-fake-token-7f3a9c1e5b2d4f6a8c0e';
const TIMEOUT_MS = 400;
/** Put into upstream responses; must never reach our responses or logs. */
const MARKER = 'UPSTREAM_BODY_MARKER_d41d8cd9';
const DISCOVER_PATH = '/3/discover/movie';
const GENRES_PATH = '/3/genre/movie/list';
const POSTER_URL = /^https:\/\/image\.tmdb\.org\/t\/p\/w780\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/;
const ALL_LOG_LEVELS = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const;

function tmdbMovie(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Movie ${id}`,
    overview: 'Plot',
    poster_path: `/poster${id}.jpg`,
    release_date: '2020-05-01',
    vote_average: 7.26,
    genre_ids: [27, 999],
    adult: false,
    ...overrides,
  };
}

function discoverBody(results: unknown[] = [tmdbMovie(1), tmdbMovie(2)]): Record<string, unknown> {
  return { page: 1, total_pages: 42, total_results: 840, results };
}

const genresBody = { genres: [{ id: 27, name: 'Horror' }] };

const okDiscover: Handler = (_req, res) => sendJson(res, 200, discoverBody());
const okGenres: Handler = (_req, res) => sendJson(res, 200, genresBody);
/** Never answers: the request hangs until the client gives up. */
const hang: Handler = () => undefined;
/** Kills the TCP connection without an HTTP response. */
const resetConnection: Handler = (req) => {
  req.socket.destroy();
};

/** An error body that echoes the credentials back, as some APIs do. */
function echoingError(status: number): Handler {
  return (req, res) =>
    sendJson(res, status, {
      status_message: `${MARKER} invalid auth: ${req.headers.authorization}`,
    });
}

/** Fake TMDB: routes by path; unknown paths get 404. */
function fakeTmdb(overrides: { discover?: Handler; genres?: Handler } = {}): Handler {
  return (req, res) => {
    const path = new URL(req.url ?? '/', 'http://fake').pathname;
    if (path === DISCOVER_PATH) {
      (overrides.discover ?? okDiscover)(req, res);
    } else if (path === GENRES_PATH) {
      (overrides.genres ?? okGenres)(req, res);
    } else {
      sendJson(res, 404, { status_message: 'unknown path' });
    }
  };
}

let upstream: FakeHttpServer;
/** A second server, used as a redirect target; must never receive a request. */
let evil: FakeHttpServer;
let evilOrigin: string;
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

  // All log levels, so the leak checks see everything a production logger could print.
  const nestApp = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_OPTIONS,
    logger: new ConsoleLogger({ colors: false, logLevels: [...ALL_LOG_LEVELS] }),
  });
  configureApp(nestApp);
  await nestApp.init();
  return nestApp;
}

function getDeck(query = ''): request.Test {
  return request(app.getHttpServer()).get(`/api/v1/movies/deck${query}`).set(bearer(session));
}

function requestsTo(path: string): URL[] {
  return upstream.requests
    .map((req) => new URL(req.url, upstreamOrigin))
    .filter((url) => url.pathname === path);
}

/** A 502 that says nothing about the cause. */
function expectOpaque502(res: request.Response): void {
  expect(res.status).toBe(502);
  expect(res.body).toEqual({ statusCode: 502, message: 'Bad Gateway' });
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(res.text).not.toMatch(/tmdb|token|credential|unauthori|timeout|401/i);
}

beforeAll(async () => {
  upstream = new FakeHttpServer(fakeTmdb());
  evil = new FakeHttpServer(okDiscover);
  upstreamOrigin = await upstream.start();
  evilOrigin = await evil.start();

  process.env.TMDB_ACCESS_TOKEN = TOKEN;
  process.env.TMDB_BASE_URL = `${upstreamOrigin}/3`;
  process.env.TMDB_TIMEOUT_MS = String(TIMEOUT_MS);
  // Imported only now: ConfigModule.forRoot() reads process.env while
  // app.module is evaluated.
  ({ AppModule } = await import('../src/app.module.js'));
});

afterAll(async () => {
  await upstream.stop();
  await evil.stop();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

beforeEach(async () => {
  upstream.reset(fakeTmdb());
  evil.reset(okDiscover);
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
    expect(logs).not.toContain(session.accessToken);
    expect(logs).not.toContain(session.refreshToken);
    expect(logs).not.toContain(MARKER);
    expect(logs).not.toContain(evilOrigin);

    // The token was never sent anywhere but TMDB_BASE_URL.
    expect(evil.requests).toEqual([]);

    for (const req of upstream.requests) {
      expect(req.method).toBe('GET');
      expect([DISCOVER_PATH, GENRES_PATH]).toContain(new URL(req.url, upstreamOrigin).pathname);
      expect(req.url).not.toContain(TOKEN);
      expect(req.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(req.body).toBe('');
      expect(req.headers.cookie).toBeUndefined();
    }
  } finally {
    output.restore();
  }
});

describe('Requests to TMDB', () => {
  it('sends the token only as a Bearer header, to the two fixed GET endpoints', async () => {
    const res = await getDeck('?page=3').expect(200);

    const deck = DeckResponseSchema.parse(res.body);
    expect(deck.items.map((card) => card.id)).toEqual([1, 2]);
    expect(deck.items[0]?.genres).toEqual(['Horror']);

    expect(upstream.requests).toHaveLength(2);
    const [discover] = requestsTo(DISCOVER_PATH);
    expect(Object.fromEntries(discover?.searchParams ?? [])).toEqual({
      include_adult: 'false',
      include_video: 'false',
      language: 'en-US',
      sort_by: 'popularity.desc',
      'vote_count.gte': '100',
      page: '3',
    });
    const [genres] = requestsTo(GENRES_PATH);
    expect(Object.fromEntries(genres?.searchParams ?? [])).toEqual({ language: 'en-US' });
    for (const req of upstream.requests) {
      expect(req.headers.accept).toBe('application/json');
    }
  });

  it('never forwards client query parameters or headers upstream', async () => {
    await getDeck('?page=2&sort_by=evil&include_adult=true&api_key=x&language=ru&with_genres=1')
      // The caller's own Authorization header (our access token) must not be
      // forwarded either: afterEach checks TMDB only ever sees the TMDB token.
      .set('Cookie', 'session=client-cookie')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('X-Api-Key', 'client-key')
      .expect(200);

    const [discover] = requestsTo(DISCOVER_PATH);
    expect(discover?.searchParams.get('page')).toBe('2');
    expect(discover?.searchParams.get('sort_by')).toBe('popularity.desc');
    expect(discover?.searchParams.get('include_adult')).toBe('false');
    expect(discover?.searchParams.get('language')).toBe('en-US');
    expect(discover?.searchParams.has('api_key')).toBe(false);
    expect(discover?.searchParams.has('with_genres')).toBe(false);
    for (const req of upstream.requests) {
      expect(req.headers['x-forwarded-for']).toBeUndefined();
      expect(req.headers['x-api-key']).toBeUndefined();
    }
  });

  it('forwards neither upstream headers nor undeclared fields to the client', async () => {
    upstream.reset(
      fakeTmdb({
        discover: (_req, res) => {
          res.writeHead(200, {
            'content-type': 'application/json',
            'set-cookie': 'tmdb=1',
            'x-upstream-secret': MARKER,
          });
          // Raw JSON, so "__proto__" is a real own key, as on the wire.
          res.end(
            `{"page":1,"total_pages":1,"__proto__":{"polluted":true},"results":[${JSON.stringify(
              tmdbMovie(1, { backdrop_path: `/${MARKER}.jpg`, video: true }),
            ).replace(/}$/, ',"__proto__":{"polluted":true}}')}]}`,
          );
        },
      }),
    );

    const res = await getDeck().expect(200);

    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['x-upstream-secret']).toBeUndefined();
    expect(res.text).not.toContain(MARKER);
    expect(res.text).not.toContain('polluted');
    const deck = res.body as DeckResponse;
    expect(Object.keys(deck).sort()).toEqual(['items', 'page', 'totalPages']);
    expect(Object.keys(deck.items[0] ?? {}).sort()).toEqual([
      'genres',
      'id',
      'overview',
      'posterUrl',
      'rating',
      'title',
      'year',
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('Upstream redirects', () => {
  it.each([301, 302, 303, 307, 308])(
    'are never followed: discover answering %d → 502, and the target gets nothing',
    async (status) => {
      upstream.reset(
        fakeTmdb({
          discover: (_req, res) =>
            sendText(res, status, MARKER, { location: `${evilOrigin}/steal?from=discover` }),
        }),
      );

      expectOpaque502(await getDeck());
      expect(evil.requests).toEqual([]);
    },
  );

  it('are never followed: a redirecting genre endpoint leaves the deck without genre names', async () => {
    upstream.reset(
      fakeTmdb({
        genres: (_req, res) => sendText(res, 302, MARKER, { location: `${evilOrigin}/steal` }),
      }),
    );

    const res = await getDeck().expect(200);

    expect(DeckResponseSchema.parse(res.body).items[0]?.genres).toEqual([]);
    expect(evil.requests).toEqual([]);
  });
});

describe('Upstream failures', () => {
  it('answer 502 when discover does not respond within TMDB_TIMEOUT_MS', async () => {
    upstream.reset(fakeTmdb({ discover: hang }));

    const started = Date.now();
    expectOpaque502(await getDeck());

    expect(Date.now() - started).toBeLessThan(TIMEOUT_MS + 1_500);
    expect(output.text()).toContain(`timed out after ${TIMEOUT_MS} ms`);
  });

  it('answer 502 when the body stalls halfway', async () => {
    upstream.reset(
      fakeTmdb({
        discover: (_req, res: ServerResponse) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.write('{"page":1,"total_pages":1,"results":[');
        },
      }),
    );

    expectOpaque502(await getDeck());
    expect(output.text()).toContain('timed out');
  });

  it('answer 502 on HTTP 401 and log a TMDB_ACCESS_TOKEN hint, never the token', async () => {
    upstream.reset(fakeTmdb({ discover: echoingError(401) }));

    expectOpaque502(await getDeck());

    // Positive control: the capture works and the operator gets a hint.
    expect(output.text()).toContain('TMDB GET /discover/movie failed: HTTP 401');
    expect(output.text()).toContain('check TMDB_ACCESS_TOKEN');
  });

  it.each([400, 403, 404, 429, 500, 503])(
    'answer 502 on HTTP %d without the upstream body',
    async (status) => {
      upstream.reset(fakeTmdb({ discover: echoingError(status) }));

      expectOpaque502(await getDeck());
      expect(output.text()).toContain(`HTTP ${status}`);
    },
  );

  it('answer 502 when the connection is reset', async () => {
    upstream.reset(fakeTmdb({ discover: resetConnection }));

    expectOpaque502(await getDeck());
    expect(output.text()).toContain('network error');
  });

  it.each<[string, Handler]>([
    ['an HTML page', (_q, r) => sendText(r, 200, `<html>${MARKER}</html>`)],
    ['an empty 200', (_q, r) => sendText(r, 200, '')],
    ['a 204', (_q, r) => sendText(r, 204, '')],
    ['truncated JSON', (_q, r) => sendText(r, 200, `{"page":1,"${MARKER}`)],
    ['JSON null', (_q, r) => sendText(r, 200, 'null')],
    ['a JSON array', (_q, r) => sendJson(r, 200, [MARKER])],
    [
      'results that is not an array',
      (_q, r) => sendJson(r, 200, { page: 1, total_pages: 1, results: MARKER }),
    ],
    [
      'a string page (holding the token)',
      (_q, r) => sendJson(r, 200, { ...discoverBody(), page: TOKEN }),
    ],
    ['a negative total_pages', (_q, r) => sendJson(r, 200, { ...discoverBody(), total_pages: -1 })],
    ['no page', (_q, r) => sendJson(r, 200, { total_pages: 1, results: [] })],
  ])('answer 502 on %s, without echoing the body', async (_name, handler) => {
    upstream.reset(fakeTmdb({ discover: handler }));

    expectOpaque502(await getDeck());
    expect(output.text()).toMatch(
      /TMDB GET \/discover\/movie failed: (?:response is not valid JSON|unexpected response shape|HTTP 204)/,
    );
  });
});

// The envelope is validated strictly, each movie on its own: a malformed movie
// is dropped (only the count is logged), and a page fails only when all of its
// movies are invalid.
describe('Movie parsing', () => {
  it.each<[string, Record<string, unknown>]>([
    ['vote_average: null', { vote_average: null }],
    ['title missing', { title: undefined }],
    ['id as a string', { id: '2' }],
    ['id: 0', { id: 0 }],
    ['genre_ids: null', { genre_ids: null }],
    ['overview: null', { overview: null }],
    ['a 600-character title', { title: 'T'.repeat(600) }],
    ['a 20 000-character overview', { overview: 'O'.repeat(20_000) }],
  ])('drops a movie with %s and still serves the page', async (_name, broken) => {
    upstream.reset(
      fakeTmdb({
        discover: (_q, r) => sendJson(r, 200, discoverBody([tmdbMovie(1), tmdbMovie(2, broken)])),
      }),
    );

    const res = await getDeck().expect(200);

    expect(DeckResponseSchema.parse(res.body).items.map((card) => card.id)).toEqual([1]);
    expect(output.text()).toContain(
      'TMDB GET /discover/movie: dropped 1 of 2 movies with an unexpected shape',
    );
  });

  it('answers 502 when every movie on the page is invalid', async () => {
    upstream.reset(
      fakeTmdb({
        discover: (_q, r) =>
          sendJson(r, 200, discoverBody([tmdbMovie(1, { id: MARKER }), tmdbMovie(2, { id: 0 })])),
      }),
    );

    expectOpaque502(await getDeck());
    expect(output.text()).toContain('all 2 movies are invalid');
  });
});

describe('Response size cap', () => {
  it('answers 502 for a discover response over 2 MB and stops downloading it', async () => {
    let written = 0;
    upstream.reset(
      fakeTmdb({
        discover: (_q, res) => {
          // An endless JSON string, sent in 64 KB chunks without a length.
          res.writeHead(200, { 'content-type': 'application/json' });
          res.write('{"page":1,"total_pages":1,"results":[],"x":"');
          const chunk = 'x'.repeat(64 * 1024);
          const pump = (): void => {
            while (written < 50 * 1024 * 1024 && res.write(chunk)) {
              written += chunk.length;
            }
            if (written < 50 * 1024 * 1024 && !res.destroyed) {
              res.once('drain', pump);
            }
          };
          res.on('close', () => res.removeAllListeners('drain'));
          pump();
        },
      }),
    );

    expectOpaque502(await getDeck());

    expect(output.text()).toContain('TMDB GET /discover/movie failed: response too large');
    // The client hung up long before the upstream could send its 50 MB.
    expect(written).toBeLessThan(20 * 1024 * 1024);
  });

  it('serves the deck without genre names when the genre list is over 2 MB', async () => {
    upstream.reset(
      fakeTmdb({
        genres: (_q, r) =>
          sendJson(r, 200, {
            genres: [{ id: 27, name: 'Horror' }],
            padding: MARKER.repeat(100_000), // ~3 MB
          }),
      }),
    );

    const res = await getDeck().expect(200);

    expect(DeckResponseSchema.parse(res.body).items[0]?.genres).toEqual([]);
    expect(output.text()).toContain('TMDB GET /genre/movie/list failed: response too large');
  });
});

describe('Poster paths', () => {
  const tricks = [
    '/../x.jpg',
    '/../../t/p/original/x.jpg',
    'https://evil.example/x.jpg',
    '//evil.example/x.jpg',
    '/\\evil.example/x.jpg',
    '\\\\evil.example\\x.jpg',
    '/a.jpg?x=1',
    '/a.jpg#frag',
    '/a.jpg/../../b.jpg',
    '/a%2F..%2Fb.jpg',
    '/a.jpg%00.png',
    '/a.jpg\n',
    '/a.jpg ',
    ' /a.jpg',
    '/ünïcödé.jpg',
    '/а.jpg', // Cyrillic "а"
    '/a‮.jpg', // right-to-left override
    '/a.jpg ',
    '/ａ.jpg', // full-width
    '/@evil.example/x.jpg',
    '/a.JPG',
    '/a.svg',
    '/a.html',
    '/.jpg',
    '/a..jpg',
    'javascript:alert(1)//.jpg',
    'data:image/png;base64,AAAA',
    '/' + 'a'.repeat(10_000) + '.jpg', // over the 100-character cap
  ];

  it('never produce a foreign posterUrl: tricky paths are dropped, well-formed ones kept', async () => {
    const valid = ['/abc123.jpg', '/A_b-9.png', '/x.webp', '/y.jpeg'];
    const results = [...tricks, ...valid].map((poster_path, i) =>
      tmdbMovie(i + 1, { poster_path }),
    );
    upstream.reset(fakeTmdb({ discover: (_q, r) => sendJson(r, 200, discoverBody(results)) }));

    const res = await getDeck().expect(200);
    const deck = DeckResponseSchema.parse(res.body);

    for (const card of deck.items) {
      expect(card.posterUrl).toMatch(POSTER_URL);
      const url = new URL(card.posterUrl);
      expect(url.origin).toBe('https://image.tmdb.org');
      expect(url.pathname.startsWith('/t/p/')).toBe(true);
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }
    const keptPaths = deck.items.map((card) =>
      card.posterUrl.replace('https://image.tmdb.org/t/p/w780', ''),
    );
    expect(keptPaths).toEqual(valid);
  });
});

// Genre names are optional: whatever goes wrong with the genre list, the deck
// is still served, with empty genre lists.
describe('Genre list failures', () => {
  it.each<[string, Handler]>([
    ['HTTP 500', echoingError(500)],
    ['HTTP 401', echoingError(401)],
    ['malformed JSON', (_q, r) => sendText(r, 200, `{${MARKER}`)],
    ['a wrong shape', (_q, r) => sendJson(r, 200, { genres: MARKER })],
    ['a connection reset', resetConnection],
  ])('leave the deck without genre names on %s', async (_name, handler) => {
    upstream.reset(fakeTmdb({ genres: handler }));

    const res = await getDeck().expect(200);

    const deck = DeckResponseSchema.parse(res.body);
    expect(deck.items.length).toBe(2);
    expect(deck.items.every((card) => card.genres.length === 0)).toBe(true);
    expect(output.text()).toContain('TMDB GET /genre/movie/list failed');
  });

  it('delay only the first deck when the genre endpoint hangs', async () => {
    upstream.reset(fakeTmdb({ genres: hang }));

    const started = Date.now();
    const res = await getDeck().expect(200);

    // The first request waits for the genre call to time out…
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    expect(DeckResponseSchema.parse(res.body).items.every((card) => card.genres.length === 0)).toBe(
      true,
    );

    // …then the failure is cached, so the next request (another page, not
    // served by the discover cache) doesn't wait again.
    const startedAgain = Date.now();
    await getDeck('?page=2').expect(200);
    expect(Date.now() - startedAgain).toBeLessThan(TIMEOUT_MS / 2);
    expect(requestsTo(GENRES_PATH)).toHaveLength(1);
  });
});

describe('Fetch error messages', () => {
  // A token with a character that is invalid in an HTTP header makes fetch
  // throw before sending anything, with the header value in the error message.
  // Env validation rejects such tokens; this client is built directly to prove
  // the message never reaches the logs either.
  it.each([
    ['a newline', `${TOKEN}\nX`],
    ['a NUL byte', `${TOKEN}\u0000X`],
    ['a zero-width space', `${TOKEN}​X`],
  ])('are never logged: a token containing %s fails with 502', async (_name, badToken) => {
    // Control: Node's fetch really puts (part of) the token into the message.
    const fetchError = await fetch(`${upstreamOrigin}${DISCOVER_PATH}`, {
      headers: { Authorization: `Bearer ${badToken}` },
    }).then(
      () => '',
      (error: unknown) => String(error),
    );
    expect(fetchError).toMatch(/TypeError/);

    const env: Env = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 3999,
      TMDB_ACCESS_TOKEN: badToken,
      TMDB_BASE_URL: `${upstreamOrigin}/3`,
      TMDB_TIMEOUT_MS: TIMEOUT_MS,
      WIKIDATA_SPARQL_URL: 'http://127.0.0.1:9/sparql',
      DATABASE_URL: 'postgresql://unused@127.0.0.1/unused',
      JWT_SECRET: 'unused-signing-material-'.repeat(3),
    };
    const client = new TmdbClient(new ConfigService<Env, true>(env));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);

    expect(output.text()).toContain('network error (TypeError)');
    expect(output.text()).not.toContain(TOKEN);
    expect(upstream.requests).toEqual([]); // nothing was sent
  });
});
