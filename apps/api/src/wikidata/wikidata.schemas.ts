import { z } from 'zod';

/**
 * Wikidata SPARQL result shapes (`application/sparql-results+json`), limited to the variables of
 * the critics' scores query. The response is untrusted input and never leaves the API.
 */

/** A movie has a handful of review-score statements; far more means a broken answer. */
export const MAX_BINDINGS = 200;

/** The result envelope; each row is validated on its own (see ScoreRowSchema). */
export const SparqlResultsSchema = z.object({
  results: z.object({ bindings: z.array(z.unknown()).max(MAX_BINDINGS) }),
});

/** One review-score statement: who published it, the score as text and when. */
export const ScoreRowSchema = z.object({
  /** Entity URI of the publisher, e.g. "http://www.wikidata.org/entity/Q105584". */
  source: z.object({ value: z.string().max(100) }),
  /** e.g. "93%", "81/100" or "7.4/10". */
  value: z.object({ value: z.string().max(50) }),
  /** xsd:dateTime, e.g. "2026-01-15T00:00:00Z"; missing when the statement has no date. */
  date: z.object({ value: z.string().max(50) }).optional(),
});
export type ScoreRow = z.infer<typeof ScoreRowSchema>;
