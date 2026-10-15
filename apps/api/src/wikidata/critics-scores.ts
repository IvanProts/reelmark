import type { CriticsScores } from '@reelmark/shared';

import { type ScoreRow, ScoreRowSchema } from './wikidata.schemas.js';

/**
 * The fixed critics' scores query and pure functions that turn its result rows into
 * `CriticsScores`. No framework code and no I/O.
 */

export const NO_SCORES: Readonly<CriticsScores> = Object.freeze({
  rottenTomatoes: null,
  metacritic: null,
});

const ENTITY = 'http://www.wikidata.org/entity/';
/** Publisher entity URI → score field. */
const SOURCES: ReadonlyMap<string, keyof CriticsScores> = new Map([
  [`${ENTITY}Q105584`, 'rottenTomatoes'],
  [`${ENTITY}Q150248`, 'metacritic'],
]);

/**
 * "93%" and "81/100" (the Tomatometer and the Metascore); other formats, such as the "7.4/10"
 * average rating, don't match.
 */
const SCORE = /^(\d{1,3})\s*(?:%|\/\s*100)$/;

/**
 * SPARQL for the review scores (P444) that Rotten Tomatoes (Q105584) and Metacritic (Q150248)
 * published for the movie with this TMDB id (P4947), with their dates (P585). Deprecated
 * statements are skipped. The id is the only variable and is written as an integer.
 */
export function criticsScoresQuery(tmdbId: number): string {
  // Defence in depth: the id goes into the query text, so it must be a plain positive integer.
  if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) {
    throw new RangeError('tmdbId must be a positive integer');
  }
  // P4947 holds the id as a string, hence the quotes around the integer.
  return `SELECT ?source ?value ?date WHERE {
  VALUES ?source { wd:Q105584 wd:Q150248 }
  ?movie wdt:P4947 "${tmdbId}" ;
         p:P444 ?statement .
  ?statement ps:P444 ?value ;
             pq:P447 ?source ;
             wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?statement pq:P585 ?date . }
}`;
}

/** "93%" → 93, "81/100" → 81; null for any other format or a value over 100. */
export function parseScore(text: string): number | null {
  const match = SCORE.exec(text.trim());
  if (!match) {
    return null;
  }
  const score = Number(match[1]);
  return score <= 100 ? score : null;
}

/**
 * Validates the rows one by one, then keeps each publisher's latest score (by date). A dated
 * statement beats an undated one; among equally dated ones the first row wins. Rows with an
 * unknown publisher or an unsupported format are ignored.
 */
export function latestScores(rows: readonly unknown[]): CriticsScores {
  const best = new Map<keyof CriticsScores, { score: number; time: number }>();
  for (const row of rows) {
    const parsed = ScoreRowSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    const candidate = scoreOf(parsed.data);
    if (!candidate) {
      continue;
    }
    const current = best.get(candidate.field);
    if (!current || candidate.time > current.time) {
      best.set(candidate.field, candidate);
    }
  }
  return {
    rottenTomatoes: best.get('rottenTomatoes')?.score ?? null,
    metacritic: best.get('metacritic')?.score ?? null,
  };
}

function scoreOf(
  row: ScoreRow,
): { field: keyof CriticsScores; score: number; time: number } | null {
  const field = SOURCES.get(row.source.value);
  const score = parseScore(row.value.value);
  if (field === undefined || score === null) {
    return null;
  }
  const time = row.date ? Date.parse(row.date.value) : Number.NaN;
  return { field, score, time: Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time };
}
