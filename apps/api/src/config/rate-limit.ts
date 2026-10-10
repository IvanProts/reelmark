import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Rate limits, enforced by UserThrottlerGuard. Requests are counted per route and per caller: the
 * signed-in user on authenticated routes, the client IP otherwise. Counters live in process memory;
 * several API instances would need a shared store (e.g. Redis) for the limits to stay global.
 */

/** Default for every route. */
export const RATE_LIMIT = {
  name: 'default',
  ttl: 60_000, // window length in milliseconds
  limit: 60, // max requests per caller per window
} satisfies ThrottlerOptions;

/** `POST /auth/anonymous` creates an account, so it is strict: 10 per hour per IP. */
export const AUTH_ANONYMOUS_RATE_LIMIT = { ttl: 60 * 60_000, limit: 10 };

/** `POST /auth/refresh`: a device refreshes about every 15 minutes, so 10 per minute is ample. */
export const AUTH_REFRESH_RATE_LIMIT = { ttl: 60_000, limit: 10 };

/**
 * `PUT` and `DELETE /me/decisions/:movieId`: fast swiping plus undo easily passes 60 per minute,
 * so these routes allow 180 per minute per user.
 */
export const DECISIONS_RATE_LIMIT = { ttl: 60_000, limit: 180 };
