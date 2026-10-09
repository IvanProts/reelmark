import { BadGatewayException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SUPPORTED_LOCALES } from '@reelmark/shared';

import type { Env } from '../config/env.schema.js';
import { TMDB_LANGUAGE } from './tmdb-language.js';
import {
  DISCOVER_CACHE_MAX_ENTRIES,
  DISCOVER_CACHE_TTL_MS,
  GENRE_CACHE_TTL_MS,
  GENRE_FAILURE_TTL_MS,
  MAX_RESPONSE_BYTES,
  TmdbClient,
} from './tmdb.client.js';

const TOKEN = 'unit-test-token-0123456789abcdef0123456789';

const env: Env = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
  TMDB_ACCESS_TOKEN: TOKEN,
  TMDB_BASE_URL: 'https://tmdb.example/3/', // the client must drop the trailing slash
  TMDB_TIMEOUT_MS: 50,
};

function tmdbMovie(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Movie ${id}`,
    overview: 'Plot',
    poster_path: '/p.jpg',
    release_date: '2020-01-01',
    vote_average: 7.1,
    genre_ids: [27],
    adult: false, // undeclared fields are fine (and dropped)
    ...overrides,
  };
}

function discoverBody(results: unknown[] = [tmdbMovie(1)]): object {
  return { page: 2, total_pages: 10, total_results: 200, results };
}

const genresBody = { genres: [{ id: 27, name: 'Horror' }] };

let fetchMock: ReturnType<typeof vi.fn>;
let logError: ReturnType<typeof vi.spyOn>;
let logWarn: ReturnType<typeof vi.spyOn>;
let client: TmdbClient;

/** Every fetch answers with a fresh Response, because a body can be read only once. */
function respondWith(body: unknown): void {
  fetchMock.mockImplementation(() => Promise.resolve(Response.json(body)));
}

/** The `[url, init]` arguments of the n-th fetch call. */
function fetchCall(n = 0): [string, RequestInit] {
  return fetchMock.mock.calls[n] as [string, RequestInit];
}

/** Everything the client logged (error + warn), as one string. */
function loggedText(): string {
  return [...logError.mock.calls, ...logWarn.mock.calls].flat().map(String).join('\n');
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // Silence and record the client's logs.
  logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  logWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  client = new TmdbClient(new ConfigService<Env, true>(env));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TMDB_LANGUAGE', () => {
  it('maps every supported locale to a TMDB language tag', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(TMDB_LANGUAGE[locale]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
    expect(TMDB_LANGUAGE).toEqual({ uk: 'uk-UA', en: 'en-US' });
  });
});

describe('TmdbClient.discoverMovies', () => {
  it('sends the token only in the Authorization header', async () => {
    respondWith(discoverBody());

    await client.discoverMovies(2, 'en');

    const [url, init] = fetchCall();
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('accept')).toBe('application/json');
    expect(url).not.toContain(TOKEN);
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['en', 'en-US'],
    ['uk', 'uk-UA'],
  ] as const)(
    'calls /discover/movie with the fixed filters (locale %s → %s)',
    async (locale, language) => {
      respondWith(discoverBody());

      await client.discoverMovies(2, locale);

      const url = new URL(fetchCall()[0]);
      expect(url.origin + url.pathname).toBe('https://tmdb.example/3/discover/movie');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        include_adult: 'false',
        include_video: 'false',
        language,
        sort_by: 'popularity.desc',
        'vote_count.gte': '100',
        page: '2',
      });
    },
  );

  it('returns the parsed body without undeclared fields', async () => {
    respondWith(discoverBody());

    const result = await client.discoverMovies(2, 'en');

    expect(result.page).toBe(2);
    expect(result.results[0]).not.toHaveProperty('adult');
    expect(result).not.toHaveProperty('total_results');
  });
});

describe('TmdbClient error handling', () => {
  it('throws 502 on a non-2xx response and logs only the status', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ status_message: 'secret upstream detail' }, { status: 500 }),
    );

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('TMDB GET /discover/movie failed: HTTP 500');
    expect(loggedText()).not.toContain('secret upstream detail');
  });

  it('throws 502 on 401 and logs a TMDB_ACCESS_TOKEN hint, never the token', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('HTTP 401');
    expect(loggedText()).toContain('TMDB_ACCESS_TOKEN');
    expect(loggedText()).not.toContain(TOKEN);
  });

  it('throws 502 on a redirect instead of following it', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example' },
      }),
    );

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('HTTP 302');
  });

  it('throws 502 on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('network error (ECONNREFUSED)');
  });

  it('throws 502 when TMDB is slower than TMDB_TIMEOUT_MS', async () => {
    // A fetch that never answers but honours the abort signal, like the real one.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('timed out after 50 ms');
  });

  it('throws 502 on malformed JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('not valid JSON');
    expect(loggedText()).not.toContain('oops');
  });

  it.each([
    ['results is not an array', { page: 1, total_pages: 1, results: 'x' }],
    ['page is missing', { total_pages: 1, results: [] }],
    ['total_pages is negative', { page: 1, total_pages: -1, results: [] }],
  ])('throws 502 when the envelope is invalid (%s)', async (_name, body) => {
    respondWith(body);

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('unexpected response shape at');
  });
});

describe('TmdbClient movie parsing', () => {
  it('drops invalid movies, keeps the valid ones and logs only the count', async () => {
    respondWith(
      discoverBody([
        tmdbMovie(1),
        tmdbMovie(2, { id: 'secret-id-value' }),
        tmdbMovie(3, { vote_average: null }),
        tmdbMovie(4, { title: 'x'.repeat(501) }), // over the length cap
        tmdbMovie(5),
      ]),
    );

    const result = await client.discoverMovies(1, 'en');

    expect(result.results.map((movie) => movie.id)).toEqual([1, 5]);
    expect(loggedText()).toContain('dropped 3 of 5 movies');
    expect(loggedText()).not.toContain('secret-id-value');
    expect(logError).not.toHaveBeenCalled();
  });

  it('throws 502 when every movie of a non-empty page is invalid', async () => {
    respondWith(discoverBody([tmdbMovie(1, { id: 0 }), { junk: true }]));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('all 2 movies are invalid');
  });

  it('accepts an empty page', async () => {
    respondWith(discoverBody([]));

    await expect(client.discoverMovies(1, 'en')).resolves.toMatchObject({
      results: [],
    });
    expect(loggedText()).toBe('');
  });
});

describe('TmdbClient response size cap', () => {
  it('throws 502 for a body over MAX_RESPONSE_BYTES', async () => {
    fetchMock.mockResolvedValue(
      new Response(`"${'x'.repeat(MAX_RESPONSE_BYTES)}"`, { status: 200 }),
    );

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('response too large');
  });

  it('throws 502 for an announced oversized body without reading it', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) },
    });
    fetchMock.mockResolvedValue(response);

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(loggedText()).toContain('response too large');
  });

  it('stops downloading an endless body soon after the cap', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x20); // spaces
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock.mockResolvedValue(new Response(endless, { status: 200 }));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(MAX_RESPONSE_BYTES + 4 * chunk.byteLength);
    expect(loggedText()).toContain('response too large');
  });
});

describe('TmdbClient discover cache', () => {
  it('serves the same page and locale from memory', async () => {
    respondWith(discoverBody());

    const first = await client.discoverMovies(1, 'en');
    const second = await client.discoverMovies(1, 'en');

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keys entries by page AND locale', async () => {
    respondWith(discoverBody());

    await client.discoverMovies(1, 'en');
    await client.discoverMovies(1, 'uk');
    await client.discoverMovies(2, 'en');
    await client.discoverMovies(1, 'uk');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('expires entries after DISCOVER_CACHE_TTL_MS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    respondWith(discoverBody());

    await client.discoverMovies(1, 'en');
    vi.advanceTimersByTime(DISCOVER_CACHE_TTL_MS - 1);
    await client.discoverMovies(1, 'en');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    await client.discoverMovies(1, 'en');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it(`keeps at most ${DISCOVER_CACHE_MAX_ENTRIES} pages, evicting the oldest`, async () => {
    respondWith(discoverBody());

    for (let page = 1; page <= DISCOVER_CACHE_MAX_ENTRIES + 1; page++) {
      await client.discoverMovies(page, 'en');
    }
    expect(fetchMock).toHaveBeenCalledTimes(DISCOVER_CACHE_MAX_ENTRIES + 1);

    // Page 2 is still cached; page 1 (the oldest) was evicted.
    await client.discoverMovies(2, 'en');
    expect(fetchMock).toHaveBeenCalledTimes(DISCOVER_CACHE_MAX_ENTRIES + 1);
    await client.discoverMovies(1, 'en');
    expect(fetchMock).toHaveBeenCalledTimes(DISCOVER_CACHE_MAX_ENTRIES + 2);
  });

  it('does not cache failures', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(Response.json(discoverBody()));

    await expect(client.discoverMovies(1, 'en')).rejects.toThrow(BadGatewayException);
    await expect(client.discoverMovies(1, 'en')).resolves.toMatchObject({
      page: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let respond: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );

    const first = client.discoverMovies(1, 'uk');
    const second = client.discoverMovies(1, 'uk');
    respond(Response.json(discoverBody()));

    expect(await first).toBe(await second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('TmdbClient.getMovieGenres', () => {
  it.each([
    ['en', 'en-US'],
    ['uk', 'uk-UA'],
  ] as const)('returns an id → name map (locale %s → %s)', async (locale, language) => {
    respondWith(genresBody);

    const genres = await client.getMovieGenres(locale);

    expect(genres.get(27)).toBe('Horror');
    const url = new URL(fetchCall()[0]);
    expect(url.pathname).toBe('/3/genre/movie/list');
    expect(Object.fromEntries(url.searchParams)).toEqual({ language });
  });

  it('caches each locale separately for 24 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    respondWith(genresBody);

    await client.getMovieGenres('en');
    await client.getMovieGenres('uk');
    await client.getMovieGenres('en');
    await client.getMovieGenres('uk');
    expect(fetchMock).toHaveBeenCalledTimes(2); // one per locale

    vi.advanceTimersByTime(GENRE_CACHE_TTL_MS - 1);
    await client.getMovieGenres('en');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2);
    await client.getMovieGenres('en');
    expect(fetchMock).toHaveBeenCalledTimes(3); // expired → refetched
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let respond: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );

    const first = client.getMovieGenres('uk');
    const second = client.getMovieGenres('uk');
    respond(Response.json(genresBody));

    expect(await first).toBe(await second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a failure for 60 seconds per locale, then retries', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('language=uk-UA')
          ? new Response('{}', { status: 503 })
          : Response.json(genresBody),
      ),
    );

    await expect(client.getMovieGenres('uk')).rejects.toThrow(BadGatewayException);
    await expect(client.getMovieGenres('uk')).rejects.toThrow(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the failure was remembered
    expect(logError).toHaveBeenCalledTimes(1); // …and logged once

    // Another locale is unaffected.
    await expect(client.getMovieGenres('en')).resolves.toBeInstanceOf(Map);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(GENRE_FAILURE_TTL_MS - 1);
    await expect(client.getMovieGenres('uk')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2);
    fetchMock.mockImplementation(() => Promise.resolve(Response.json(genresBody)));
    await expect(client.getMovieGenres('uk')).resolves.toBeInstanceOf(Map);
    expect(fetchMock).toHaveBeenCalledTimes(3); // retried after 60 s
  });
});
