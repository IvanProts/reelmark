import { type IncomingHttpHeaders, request as httpRequest, STATUS_CODES } from 'node:http';
import { type AddressInfo, connect } from 'node:net';
import { gzipSync } from 'node:zlib';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';

import { DeckResponseSchema, type Locale } from '@reelmark/shared';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { RATE_LIMIT } from '../src/config/rate-limit.js';
import { TmdbClient } from '../src/tmdb/tmdb.client.js';
import type { TmdbDiscoverResponse } from '../src/tmdb/tmdb.schemas.js';

/**
 * Hostile input against the real HTTP stack: helmet, routing, body parsers,
 * the validation pipe, the throttler guard and the exception filter.
 * TmdbClient is faked, so nothing leaves the machine.
 *
 * Requests go through node:http and raw sockets, which send the request target
 * byte for byte, without the URL normalisation higher-level clients apply
 * ("/api/../x" stays "/api/../x").
 */

/** Sent inside requests; must never be echoed back. */
const MARKER = 'INPUT_MARKER_5f2b';

const LANG_ERROR = 'Invalid request. lang: Invalid option: expected one of "uk"|"en"';

class FakeTmdbClient {
  discoverMovies = vi.fn((page: number, _locale: Locale): Promise<TmdbDiscoverResponse> =>
    Promise.resolve({
      page,
      total_pages: 10,
      results: [
        {
          id: 1,
          title: 'Movie',
          overview: 'Plot',
          poster_path: '/p.jpg',
          release_date: '2020-01-01',
          vote_average: 7,
          genre_ids: [],
        },
      ],
    }),
  );

  getMovieGenres = vi.fn((_locale: Locale) => Promise.resolve(new Map<number, string>()));
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
  /** Parsed JSON body, or undefined. */
  body: unknown;
}

async function startApp(
  tmdb: FakeTmdbClient,
  options: { rateLimit?: number } = {},
): Promise<{ app: INestApplication; port: number }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TmdbClient)
    .useValue(tmdb)
    .overrideProvider(getOptionsToken())
    .useValue({
      throttlers: [{ ...RATE_LIMIT, limit: options.rateLimit ?? 100_000 }],
    })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, port };
}

function send(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<RawResponse> {
  const { body } = options;
  const headers = { ...options.headers };
  if (body !== undefined) {
    headers['content-length'] = String(Buffer.byteLength(body));
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown;
        try {
          parsed = text ? (JSON.parse(text) as unknown) : undefined;
        } catch {
          parsed = undefined;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Writes raw bytes to the socket; resolves with whatever comes back. */
function sendRaw(port: number, data: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(data));
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('latin1')));
    socket.on('error', () => undefined); // ECONNRESET after a 4xx is expected
  });
}

const HELMET_HEADERS: Record<string, string | RegExp> = {
  'content-security-policy': /default-src 'self'/,
  'strict-transport-security': /max-age=\d+/,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-dns-prefetch-control': 'off',
  'x-download-options': 'noopen',
  'x-permitted-cross-domain-policies': 'none',
  'x-xss-protection': '0',
};

function expectSecurityHeaders(headers: IncomingHttpHeaders): void {
  for (const [name, expected] of Object.entries(HELMET_HEADERS)) {
    const value = headers[name];
    expect(value, name).toBeTypeOf('string');
    if (typeof expected === 'string') {
      expect(value, name).toBe(expected);
    } else {
      expect(value, name).toMatch(expected);
    }
  }
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['access-control-allow-origin']).toBeUndefined();
}

/**
 * The contract for every rejected request: exact `{ statusCode, message }`
 * JSON with the expected 4xx, a safe message, no echo of the input, no stack
 * trace, no HTML, and the security headers.
 */
function expectSafeError(res: RawResponse, status: number): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(res.body).toEqual({ statusCode: status, message: expect.any(String) });
  const { message } = res.body as { message: string };
  if (message !== STATUS_CODES[status]) {
    // The only custom messages come from the validation pipe and name fields
    // only; quotes and "|" come from the schema ('expected one of "uk"|"en"').
    expect(message).toMatch(/^Invalid request\. (?:page|lang): [\w :<>=.,"|-]+$/);
  }
  expect(res.text).not.toContain(MARKER);
  expect(res.text).not.toMatch(/<html|<!DOCTYPE|\bat .+:\d+:\d+|node_modules|\/src\//i);
  expectSecurityHeaders(res.headers);
}

describe('HTTP surface under hostile input', () => {
  let app: INestApplication;
  let port: number;
  let tmdb: FakeTmdbClient;

  beforeAll(async () => {
    tmdb = new FakeTmdbClient();
    ({ app, port } = await startApp(tmdb));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Deck query validation', () => {
    it.each([
      '-1',
      '-0',
      '1.5',
      '1e3',
      '501',
      'abc',
      '',
      '9'.repeat(400),
      'Infinity',
      'NaN',
      'null',
      'true',
      '[]',
      '1%00',
      '%',
      '%E0%A4%A', // broken UTF-8
      '%EF%BC%95', // full-width "5"
      '%D9%A3', // Arabic-Indic "3"
      '%F0%9F%92%A9',
      '1%26page%3D2', // "1&page=2", encoded
      `${MARKER}%3Cscript%3E`,
    ])('rejects page=%s with 400', async (page) => {
      const res = await send(port, 'GET', `/api/v1/movies/deck?page=${page}`);

      expectSafeError(res, 400);
      expect(tmdb.discoverMovies).not.toHaveBeenCalled();
    });

    // The contract accepts exactly one spelling per page: a plain decimal
    // string, so every page has a single cache key.
    it.each([
      '0b11',
      '0o7',
      '1e2',
      '%2B5', // "+5"
      '5.0',
      '7.0',
      '%207', // " 7"
      '%207%20', // " 7 "
      '%0A8%09', // "\n8\t"
      '00042',
      '007',
      '07',
    ])('rejects the non-canonical page=%s with 400', async (page) => {
      const res = await send(port, 'GET', `/api/v1/movies/deck?page=${page}`);

      expectSafeError(res, 400);
      expect(tmdb.discoverMovies).not.toHaveBeenCalled();
    });

    it.each(['page=1&page=2', 'page=2&page=2', 'page=1&page=', `page=1&page=${MARKER}`])(
      'rejects repeated parameters (%s) with 400',
      async (query) => {
        expectSafeError(await send(port, 'GET', `/api/v1/movies/deck?${query}`), 400);
        expect(tmdb.discoverMovies).not.toHaveBeenCalled();
      },
    );

    it.each([
      'UK',
      'Uk',
      'EN',
      'uk-UA',
      'en-US',
      'en_US',
      '',
      '%20uk',
      'uk%20',
      '%E2%80%8Buk', // zero-width space + "uk"
      'uk%00',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      `${MARKER}%3Cscript%3E`,
      'uk&lang=en', // repeated → array
    ])('rejects lang=%s with 400 without echoing it', async (lang) => {
      const res = await send(port, 'GET', `/api/v1/movies/deck?lang=${lang}`);

      expectSafeError(res, 400);
      expect(res.body).toEqual({ statusCode: 400, message: LANG_ERROR });
      expect(tmdb.discoverMovies).not.toHaveBeenCalled();
    });

    // Express 5's "simple" query parser does not expand brackets, so these are
    // unknown keys: the schema strips them and the defaults apply.
    it.each(['page[]=7', 'page[x]=7', 'page[__proto__]=7', '__proto__[page]=7', 'lang[]=uk'])(
      'treats %s as an unknown key and serves the defaults',
      async (query) => {
        const res = await send(port, 'GET', `/api/v1/movies/deck?${query}`);

        expect(res.status).toBe(200);
        expect(tmdb.discoverMovies).toHaveBeenCalledWith(1, 'en');
      },
    );

    it('decodes a percent-encoded parameter name ("pa%67e" is "page")', async () => {
      await send(port, 'GET', '/api/v1/movies/deck?pa%67e=9');

      expect(tmdb.discoverMovies).toHaveBeenCalledWith(9, 'en');
    });

    it('serves the deck despite a ~15 KB query of junk parameters', async () => {
      const junk = Array.from({ length: 380 }, (_, i) => `k${i}=%F0%9F%92%A9${MARKER}`).join('&');
      expect(junk.length).toBeGreaterThan(13_000);
      expect(junk.length).toBeLessThan(15_500);

      const res = await send(port, 'GET', `/api/v1/movies/deck?page=3&${junk}`);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain(MARKER);
      expect(tmdb.discoverMovies).toHaveBeenCalledWith(3, 'en');
    });

    it('reads the page from the query only, never from a JSON body', async () => {
      const res = await send(port, 'GET', '/api/v1/movies/deck', {
        headers: { 'content-type': 'application/json' },
        body: '{"page":7,"__proto__":{"polluted":true}}',
      });

      expect(res.status).toBe(200);
      expect(DeckResponseSchema.parse(res.body).page).toBe(1);
      expect(tmdb.discoverMovies).toHaveBeenCalledWith(1, 'en');
    });
  });

  // Body parsers run before routing, for every method and route.
  describe('Request bodies', () => {
    it.each<[string, Record<string, string>, string | Buffer, number]>([
      ['malformed JSON', { 'content-type': 'application/json' }, `{"page": ${MARKER}`, 400],
      [
        'a 200 KB JSON body',
        { 'content-type': 'application/json' },
        JSON.stringify({ big: MARKER.repeat(15_000) }),
        413,
      ],
      [
        'a gzip bomb (5 MB inflated)',
        { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        gzipSync(`{"a":"${' '.repeat(5_000_000)}"}`),
        413,
      ],
      [
        'broken gzip',
        { 'content-type': 'application/json', 'content-encoding': 'gzip' },
        MARKER,
        400,
      ],
      [
        'an unknown content-encoding',
        { 'content-type': 'application/json', 'content-encoding': MARKER },
        '{}',
        415,
      ],
      [
        'an unsupported JSON charset',
        { 'content-type': `application/json; charset=${MARKER}` },
        '{}',
        415,
      ],
      [
        'too many urlencoded params',
        { 'content-type': 'application/x-www-form-urlencoded' },
        `${MARKER}=1&`.repeat(2_000),
        413,
      ],
      [
        'deeply nested urlencoded keys',
        { 'content-type': 'application/x-www-form-urlencoded' },
        `${MARKER}${'[a]'.repeat(64)}=1`,
        400,
      ],
    ])('rejects %s on GET and POST with %d', async (_name, headers, body, status) => {
      for (const method of ['GET', 'POST']) {
        const res = await send(port, method, '/api/v1/movies/deck', { headers, body });
        expectSafeError(res, status);
      }
      expect(tmdb.discoverMovies).not.toHaveBeenCalled();
    });

    it.each([
      ['a 200 KB JSON body', JSON.stringify({ big: MARKER.repeat(15_000) })],
      ['malformed JSON', `{"leak": ${MARKER}`],
    ])('rejects %s outside /api with 404 before parsing it', async (_name, body) => {
      const res = await send(port, 'POST', '/elsewhere', {
        headers: { 'content-type': 'application/json' },
        body,
      });

      expectSafeError(res, 404);
    });
  });

  describe('HTTP methods', () => {
    // Unsupported methods get a plain 404 without an Allow header, which
    // reveals less than a 405 would.
    it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE', 'PROPFIND', 'MKCOL', 'LOCK'])(
      'answers %s on existing routes with a 404 ApiError',
      async (method) => {
        for (const path of ['/api/v1/movies/deck', '/api/v1/health']) {
          const res = await send(port, method, path, {
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          expectSafeError(res, 404);
          expect(res.headers.allow).toBeUndefined();
        }
        expect(tmdb.discoverMovies).not.toHaveBeenCalled();
      },
    );

    it('answers a CORS preflight with 404 and no CORS headers', async () => {
      const res = await send(port, 'OPTIONS', '/api/v1/movies/deck', {
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'GET',
        },
      });

      expectSafeError(res, 404);
    });

    it('routes HEAD like GET, including the TMDB call', async () => {
      const res = await send(port, 'HEAD', '/api/v1/movies/deck?page=2');

      expect(res.status).toBe(200);
      expect(res.text).toBe('');
      expectSecurityHeaders(res.headers);
      expect(tmdb.discoverMovies).toHaveBeenCalledWith(2, 'en');
    });

    it.each([
      `FOO /api/v1/health HTTP/1.1\r\nHost: x\r\n\r\n`,
      `CONNECT 127.0.0.1:22 HTTP/1.1\r\nHost: x\r\n\r\n`,
    ])('leaves a method Node does not route to Node itself: %j', async (raw) => {
      const response = await sendRaw(port, raw);

      // Node's own minimal reply (or none at all), never an Express or Nest page.
      expect(response === '' || response.startsWith('HTTP/1.1 400 Bad Request\r\n')).toBe(true);
    });
  });

  describe('Paths', () => {
    it.each([
      '/',
      '/index.html',
      '/.env',
      '/api/.env',
      '/api/v1/.env',
      '/apps/api/.env',
      '/.git/config',
      '/api/../.env',
      '/api/v1/../../.env',
      '/api/v1/movies/../health',
      '/api/v1/movies/%2e%2e/health',
      '/api/v1/movies/%2E%2E%2Fhealth',
      '/api%2fv1%2fhealth',
      '/api%2Fv1/health',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/api/v1/..%2f..%2f..%2fetc%2fpasswd',
      '/api/v1/..%5c..%5cwindows%5cwin.ini',
      '//api/v1/health',
      '/api//v1/health',
      '/api/v1//health',
      '/api/v1/health%00',
      '/api/v1/health%00.json',
      '/api/v1/health;jsessionid=1',
      '/API/v1/health', // the /api prefix check is case-sensitive
      '/movies/deck', // outside the /api prefix
      '/apiary',
      `/api/v1/${MARKER}%3Cscript%3E`,
      `/api/v1/${'a'.repeat(15_000)}`,
      '/api/movies/deck', // no version
      '/api/v2/health', // unknown version
      '/api/v0/movies/deck',
      '/api/vabc/movies/deck',
      '/api/v1/movies',
      '/api/v1/movies/deck/extra',
    ])('answers %s with a 404 ApiError and no internals', async (path) => {
      expectSafeError(await send(port, 'GET', path), 404);
    });

    // Express route matching ignores case and a trailing slash, so these reach
    // the route: same handler, same rate-limit key.
    it.each(['/api/V1/health', '/api/v1/HEALTH', '/api/v1/health/'])(
      'routes %s to the existing handler',
      async (path) => {
        expect((await send(port, 'GET', path)).status).toBe(200);
      },
    );

    it('answers an absolute-form request target for its path only', async () => {
      const response = await sendRaw(
        port,
        'GET http://evil.example/api/v1/health HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n',
      );

      expect(response).toMatch(/^HTTP\/1\.1 200 OK\r\n/);
      expect(response).toContain('{"status":"ok"}');
    });

    it('leaves a URL over the 16 KB header limit to Node (431 or reset), never a 500', async () => {
      const response = await sendRaw(
        port,
        `GET /api/v1/movies/deck?x=${'a'.repeat(70_000)} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`,
      );

      expect(
        response === '' || response.startsWith('HTTP/1.1 431 Request Header Fields Too Large\r\n'),
      ).toBe(true);
    });

    // Node's HTTP parser rejects these before any of our code (or logging) runs.
    it.each([
      ['an ANSI escape in the URL', 'GET /api/v1/movies/deck?x=\u001b[31m HTTP/1.1'],
      ['a tab in the path', 'GET /api/v1/hea\tlth HTTP/1.1'],
      ['raw UTF-8 in the URL', 'GET /api/v1/movies/deck?page=é HTTP/1.1'],
      [
        'header smuggling (TE + CL)',
        'POST /api/v1/health HTTP/1.1\r\nContent-Length: 4\r\nTransfer-Encoding: chunked',
      ],
    ])('rejects %s with a bare 400 from Node', async (_name, head) => {
      const response = await sendRaw(
        port,
        `${head}\r\nHost: x\r\nConnection: close\r\n\r\n0\r\n\r\n`,
      );

      expect(response).toMatch(/^HTTP\/1\.1 400 Bad Request\r\n/);
    });
  });

  describe('Security headers', () => {
    it('are set on successful responses', async () => {
      for (const path of ['/api/v1/health', '/api/v1/movies/deck']) {
        const res = await send(port, 'GET', path);
        expect(res.status).toBe(200);
        expectSecurityHeaders(res.headers);
      }
    });

    it('are set on 4xx and 5xx responses too', async () => {
      tmdb.discoverMovies.mockRejectedValueOnce(new Error(MARKER));

      const responses = await Promise.all([
        send(port, 'GET', '/nope'),
        send(port, 'GET', '/api/v1/movies/deck?page=0'),
        send(port, 'POST', '/api/v1/health', {
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
        send(port, 'GET', '/api/v1/movies/deck'), // → 500
      ]);

      expect(responses.map((res) => res.status)).toEqual([404, 400, 400, 500]);
      for (const res of responses) {
        expectSecurityHeaders(res.headers);
        expect(res.text).not.toContain(MARKER);
      }
    });

    it('never include CORS headers, even for a cross-origin GET', async () => {
      const res = await send(port, 'GET', '/api/v1/health', {
        headers: { origin: 'https://evil.example' },
      });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });
});

describe('Rate limiting', () => {
  let app: INestApplication;
  let port: number;
  let tmdb: FakeTmdbClient;

  beforeEach(async () => {
    tmdb = new FakeTmdbClient();
    // The production limit, not a reduced one.
    ({ app, port } = await startApp(tmdb, { rateLimit: RATE_LIMIT.limit }));
  });

  afterEach(async () => {
    await app.close();
  });

  async function exhaust(path = '/api/v1/movies/deck'): Promise<void> {
    for (let i = 0; i < RATE_LIMIT.limit; i++) {
      const res = await send(port, 'GET', path);
      expect(res.status).not.toBe(429);
    }
  }

  it(`allows ${RATE_LIMIT.limit} requests per window, then answers 429 with the ApiError shape`, async () => {
    const first = await send(port, 'GET', '/api/v1/movies/deck');
    expect(first.headers['x-ratelimit-limit']).toBe(String(RATE_LIMIT.limit));
    expect(first.headers['x-ratelimit-remaining']).toBe(String(RATE_LIMIT.limit - 1));
    for (let i = 1; i < RATE_LIMIT.limit; i++) {
      await send(port, 'GET', '/api/v1/movies/deck');
    }
    vi.clearAllMocks();

    const res = await send(port, 'GET', '/api/v1/movies/deck');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ statusCode: 429, message: 'Too Many Requests' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(RATE_LIMIT.ttl / 1000);
    expectSecurityHeaders(res.headers);
    expect(tmdb.discoverMovies).not.toHaveBeenCalled();
  });

  it('cannot be bypassed with spoofed proxy headers (trust proxy is off)', async () => {
    await exhaust();

    const spoofs: Record<string, string>[] = [
      { 'x-forwarded-for': '203.0.113.1' },
      { 'x-forwarded-for': '203.0.113.2, 198.51.100.9' },
      { 'x-real-ip': '203.0.113.3' },
      { forwarded: 'for=203.0.113.4' },
      { 'true-client-ip': '203.0.113.5' },
      { 'cf-connecting-ip': '203.0.113.6' },
    ];
    for (const headers of spoofs) {
      const res = await send(port, 'GET', '/api/v1/movies/deck', { headers });
      expect(res.status).toBe(429);
    }
  });

  it('cannot be bypassed with path variants or HEAD (counted per handler)', async () => {
    await exhaust();

    for (const [method, path] of [
      ['GET', '/api/v1/movies/deck/'],
      ['GET', '/api/V1/movies/deck'],
      ['GET', '/api/v1/MOVIES/DECK?page=2'],
      ['HEAD', '/api/v1/movies/deck'],
    ] as const) {
      expect((await send(port, method, path)).status).toBe(429);
    }
  });

  it('counts invalid requests too, because the guard runs before validation', async () => {
    await exhaust('/api/v1/movies/deck?page=0'); // all answered with 400

    expect((await send(port, 'GET', '/api/v1/movies/deck')).status).toBe(429);
  });

  it('never throttles the health check, even while the deck is throttled', async () => {
    await exhaust();

    for (let i = 0; i < RATE_LIMIT.limit + 5; i++) {
      expect((await send(port, 'GET', '/api/v1/health')).status).toBe(200);
    }
  });

  // Guards run only for matched routes, so 404s and body-parser rejections
  // (400/413/415) are never rate-limited. They are cheap to answer.
  it('does not limit unmatched routes or body-parser rejections', async () => {
    for (let i = 0; i < RATE_LIMIT.limit + 5; i++) {
      expect((await send(port, 'GET', '/api/v1/nope')).status).toBe(404);
    }
    for (let i = 0; i < RATE_LIMIT.limit + 5; i++) {
      const res = await send(port, 'GET', '/api/v1/movies/deck', {
        headers: { 'content-type': 'application/json' },
        body: '{',
      });
      expect(res.status).toBe(400);
    }
    // Neither of them used up the deck's budget.
    expect((await send(port, 'GET', '/api/v1/movies/deck')).status).toBe(200);
  });
});
