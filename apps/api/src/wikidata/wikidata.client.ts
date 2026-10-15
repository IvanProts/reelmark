import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CriticsScores } from '@reelmark/shared';

import { AsyncCache } from '../common/async-cache.js';
import { describeFetchError, readTextUpTo } from '../common/upstream-response.js';
import type { Env } from '../config/env.schema.js';
import { criticsScoresQuery, latestScores, NO_SCORES } from './critics-scores.js';
import { SparqlResultsSchema } from './wikidata.schemas.js';

/** Critics' scores rarely change once a movie is out. */
export const SCORES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failure is remembered this long, so a struggling Wikidata isn't asked again on every view. */
export const SCORES_FAILURE_TTL_MS = 10 * 60 * 1000;
/** An entry is two numbers, so many movies fit. */
export const SCORES_CACHE_MAX_ENTRIES = 5000;
/** A real answer is a few KB. */
export const MAX_SCORES_RESPONSE_BYTES = 256 * 1024;

/** Wikimedia's User-Agent policy asks for a name and a way to reach the operator. */
export const USER_AGENT = 'Reelmark/0.1 (https://github.com/IvanProts/reelmark)';

/**
 * Critics' scores (Rotten Tomatoes, Metacritic) from Wikidata's public SPARQL endpoint.
 *
 * It sends only the fixed query from `criticsScoresQuery`, so the API can't become a proxy to
 * Wikidata. The scores are a nice-to-have: any failure (network, timeout, non-2xx, oversized or
 * unexpected body) is logged and yields null scores; it never fails the caller's request.
 */
@Injectable()
export class WikidataClient {
  private readonly logger = new Logger(WikidataClient.name);
  private readonly sparqlUrl: string;
  private readonly timeoutMs: number;

  // Cached values are shared between requests: never mutate them.
  private readonly cache = new AsyncCache<CriticsScores>({
    ttlMs: SCORES_CACHE_TTL_MS,
    failureTtlMs: SCORES_FAILURE_TTL_MS,
    maxEntries: SCORES_CACHE_MAX_ENTRIES,
  });

  constructor(config: ConfigService<Env, true>) {
    this.sparqlUrl = config.get('WIKIDATA_SPARQL_URL', { infer: true });
    // The details request waits for TMDB and Wikidata in parallel, so sharing TMDB's limit means
    // the scores never make it slower than TMDB may.
    this.timeoutMs = config.get('TMDB_TIMEOUT_MS', { infer: true });
  }

  /**
   * The movie's latest critics' scores, null where Wikidata has none. Cached for 7 days; a failure
   * gives null scores and is remembered for 10 minutes. Never rejects.
   */
  getCriticsScores(movieId: number): Promise<CriticsScores> {
    return this.cache.get(String(movieId), () => this.fetchScores(movieId)).catch(() => NO_SCORES);
  }

  private async fetchScores(movieId: number): Promise<CriticsScores> {
    const url = new URL(this.sparqlUrl);
    url.search = new URLSearchParams({
      query: criticsScoresQuery(movieId),
      format: 'json',
    }).toString();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
        // A redirect is treated as a failure, so requests only ever go to WIKIDATA_SPARQL_URL.
        redirect: 'manual',
        // Covers the whole exchange, including reading the body.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw this.failure(movieId, describeFetchError(error, this.timeoutMs));
    }

    if (!response.ok) {
      // Error bodies are never read; this only releases the connection.
      await response.body?.cancel().catch(() => undefined);
      throw this.failure(movieId, `HTTP ${response.status}`);
    }

    let text: string | undefined;
    try {
      text = await readTextUpTo(response, MAX_SCORES_RESPONSE_BYTES);
    } catch (error) {
      throw this.failure(movieId, describeFetchError(error, this.timeoutMs));
    }
    if (text === undefined) {
      throw this.failure(movieId, `response too large (over ${MAX_SCORES_RESPONSE_BYTES} bytes)`);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw this.failure(movieId, 'response is not valid JSON');
    }
    const parsed = SparqlResultsSchema.safeParse(body);
    if (!parsed.success) {
      // Only the location of the problem, never the data itself.
      const where = parsed.error.issues[0]?.path.join('.') || '(root)';
      throw this.failure(movieId, `unexpected response shape at ${where}`);
    }
    return latestScores(parsed.data.results.bindings);
  }

  /** Logs why the query failed (never the response body) and returns an error to throw. */
  private failure(movieId: number, reason: string): Error {
    this.logger.warn(`Wikidata scores for movie ${movieId} unavailable: ${reason}`);
    return new Error(`Wikidata query failed: ${reason}`);
  }
}
