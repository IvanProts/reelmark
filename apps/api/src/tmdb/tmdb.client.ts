import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ZodType } from 'zod';

import { type Locale, SUPPORTED_LOCALES } from '@reelmark/shared';

import { AsyncCache } from '../common/async-cache.js';
import type { Env } from '../config/env.schema.js';
import { TMDB_LANGUAGE } from './tmdb-language.js';
import {
  parseMovies,
  type TmdbDiscoverResponse,
  TmdbDiscoverEnvelopeSchema,
  TmdbGenreListSchema,
} from './tmdb.schemas.js';

/** TMDB's genre list rarely changes, so it is fetched once a day. */
export const GENRE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * A failed genre call is remembered this long, so a broken genre endpoint
 * neither doubles our upstream calls nor delays every deck by the timeout.
 */
export const GENRE_FAILURE_TTL_MS = 60 * 1000;
/** Popularity changes slowly; a short cache absorbs repeated page requests. */
export const DISCOVER_CACHE_TTL_MS = 10 * 60 * 1000;
export const DISCOVER_CACHE_MAX_ENTRIES = 200;
/** A discover page is ~10 KB; anything this big is not a real TMDB answer. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const DISCOVER_PATH = '/discover/movie';
const GENRES_PATH = '/genre/movie/list';

export type GenreMap = ReadonlyMap<number, string>;

/**
 * The only code in the API that talks to TMDB.
 *
 * It offers a few fixed, typed methods instead of a generic `get(anyPath)`, so
 * the API can't become an open proxy to TMDB, and every response is validated
 * before the rest of the app sees it.
 *
 * Any failure (network, timeout, non-2xx, oversized or unexpected body) is
 * logged here and surfaces as a 502 Bad Gateway.
 */
@Injectable()
export class TmdbClient {
  private readonly logger = new Logger(TmdbClient.name);
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly timeoutMs: number;

  // Cached values are shared between requests: never mutate them.
  private readonly discoverCache = new AsyncCache<TmdbDiscoverResponse>({
    ttlMs: DISCOVER_CACHE_TTL_MS,
    maxEntries: DISCOVER_CACHE_MAX_ENTRIES,
  });
  private readonly genreCache = new AsyncCache<GenreMap>({
    ttlMs: GENRE_CACHE_TTL_MS,
    failureTtlMs: GENRE_FAILURE_TTL_MS,
    maxEntries: SUPPORTED_LOCALES.length, // one genre list per locale
  });

  // `ConfigService<Env, true>` gives typed access to the validated env;
  // `true` means validated, so `get()` never returns undefined.
  constructor(config: ConfigService<Env, true>) {
    // Drop a trailing slash so `${baseUrl}${path}` never produces "//".
    this.baseUrl = config.get('TMDB_BASE_URL', { infer: true }).replace(/\/+$/, '');
    this.accessToken = config.get('TMDB_ACCESS_TOKEN', { infer: true });
    this.timeoutMs = config.get('TMDB_TIMEOUT_MS', { infer: true });
  }

  /**
   * One page (20 movies) of popular movies, without adult content and
   * obscure titles, with texts in `locale`. Cached for 10 minutes.
   */
  discoverMovies(page: number, locale: Locale): Promise<TmdbDiscoverResponse> {
    return this.discoverCache.get(`${locale}:${page}`, () => this.fetchDiscover(page, locale));
  }

  /**
   * Genre id → name in `locale`, e.g. 27 → "Жахи". Cached for 24 hours;
   * a failure is cached for 60 seconds.
   */
  getMovieGenres(locale: Locale): Promise<GenreMap> {
    return this.genreCache.get(locale, () => this.fetchGenres(locale));
  }

  private async fetchDiscover(page: number, locale: Locale): Promise<TmdbDiscoverResponse> {
    const query = new URLSearchParams({
      include_adult: 'false',
      include_video: 'false',
      language: TMDB_LANGUAGE[locale],
      sort_by: 'popularity.desc',
      'vote_count.gte': '100', // skip junk with a handful of votes
      page: String(page),
    });
    const envelope = await this.get(DISCOVER_PATH, query, TmdbDiscoverEnvelopeSchema);

    // Movies are validated one by one, so a malformed movie is dropped instead
    // of failing the whole page.
    const { movies, dropped } = parseMovies(envelope.results);
    if (dropped > 0) {
      if (movies.length === 0) {
        throw this.failure(
          DISCOVER_PATH,
          `unexpected response shape: all ${dropped} movies are invalid`,
        );
      }
      this.logger.warn(
        `TMDB GET ${DISCOVER_PATH}: dropped ${dropped} of ${envelope.results.length} movies with an unexpected shape`,
      );
    }
    return {
      page: envelope.page,
      total_pages: envelope.total_pages,
      results: movies,
    };
  }

  private async fetchGenres(locale: Locale): Promise<GenreMap> {
    const query = new URLSearchParams({ language: TMDB_LANGUAGE[locale] });
    const body = await this.get(GENRES_PATH, query, TmdbGenreListSchema);
    return new Map(body.genres.map(({ id, name }) => [id, name]));
  }

  /** GET `path`, then parse the JSON body with `schema`. */
  private async get<T>(path: string, query: URLSearchParams, schema: ZodType<T>): Promise<T> {
    const url = `${this.baseUrl}${path}?${query.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          // The token goes in a header, never in the URL: URLs end up in logs
          // (ours, proxies', TMDB's).
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
        // Redirects are never followed, so the token only ever goes to
        // TMDB_BASE_URL. A 3xx is handled like any other non-2xx below.
        redirect: 'manual',
        // Covers the whole exchange, including reading the body.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw this.failure(path, this.describe(error));
    }

    if (!response.ok) {
      // Error bodies may echo request details, so they are never read; this
      // only releases the connection.
      await response.body?.cancel().catch(() => undefined);
      const failure = this.failure(path, `HTTP ${response.status}`);
      if (response.status === 401) {
        this.logger.error(
          'TMDB rejected our credentials: check TMDB_ACCESS_TOKEN in apps/api/.env',
        );
      }
      throw failure;
    }

    let text: string | undefined;
    try {
      text = await readTextUpTo(response, MAX_RESPONSE_BYTES);
    } catch (error) {
      throw this.failure(path, this.describe(error));
    }
    if (text === undefined) {
      throw this.failure(path, `response too large (over ${MAX_RESPONSE_BYTES} bytes)`);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw this.failure(path, 'response is not valid JSON');
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      // Only the location and kind of the problem, never the data itself.
      const issue = parsed.error.issues[0];
      const where = issue?.path.join('.') || '(root)';
      throw this.failure(path, `unexpected response shape at ${where}: ${issue?.message}`);
    }
    return parsed.data;
  }

  /**
   * Logs why a TMDB call failed (never headers, the token or the response
   * body) and returns a generic 502 for the caller to throw.
   */
  private failure(path: string, reason: string): BadGatewayException {
    this.logger.error(`TMDB GET ${path} failed: ${reason}`);
    return new BadGatewayException('TMDB request failed');
  }

  /**
   * A short, safe failure reason. Never `error.message`: Node's fetch errors
   * can quote request headers, including the token.
   */
  private describe(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'unknown error';
    }
    if (error.name === 'TimeoutError') {
      return `timed out after ${this.timeoutMs} ms`;
    }
    // Node's fetch throws `TypeError: fetch failed` and puts the real reason
    // (ECONNREFUSED, ENOTFOUND, …) into `cause.code`.
    const code = (error.cause as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' ? `network error (${code})` : `network error (${error.name})`;
  }
}

/**
 * Reads the body as UTF-8 text, but stops downloading and returns undefined as
 * soon as it exceeds `maxBytes`. `response.json()` would buffer whatever the
 * server sends, however large.
 */
async function readTextUpTo(response: Response, maxBytes: number): Promise<string | undefined> {
  // Cheap early exit when the server announces the size up front.
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) {
    return ''; // e.g. 204 No Content
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
