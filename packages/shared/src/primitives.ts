import { z } from 'zod';

/**
 * An integer in [min, max] that may arrive as a number (JSON) or as text (query strings, route
 * params). Text must be the canonical decimal spelling — "7", not "07", "7.0", " 7" or "0x7" — so a
 * value has exactly one representation (matters for caching and logging).
 */
export function intParam(min: number, max: number) {
  const int = z.number().int().min(min).max(max);
  return z.union([
    int,
    z
      .string()
      .max(16)
      .regex(/^(0|[1-9]\d*)$/)
      .transform(Number)
      .pipe(int),
  ]);
}
