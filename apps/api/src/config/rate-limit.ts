import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Global rate limit, enforced by the ThrottlerGuard registered in AppModule.
 * Requests are counted per client IP and per route (the throttler's default
 * key). Counters live in process memory; running several API instances needs a
 * shared store (e.g. Redis) for the limit to stay global.
 */
export const RATE_LIMIT = {
  name: 'default',
  ttl: 60_000, // window length in milliseconds
  limit: 60, // max requests per client per window
} satisfies ThrottlerOptions;
