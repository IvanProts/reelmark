import { z } from 'zod';

/**
 * Refresh tokens are 256 random bits, base64url-encoded without padding (43 characters). Anything
 * else is rejected before it reaches the database.
 */
export const RefreshTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Response of `POST /api/v1/auth/anonymous` and `POST /api/v1/auth/refresh`. */
export const AuthTokensSchema = z.object({
  /** Short-lived JWT for the `Authorization: Bearer` header. Keep it in memory only. */
  accessToken: z.string().min(1),
  /** Seconds until `accessToken` expires. */
  expiresIn: z.number().int().positive(),
  /** Single-use token for `POST /auth/refresh`. Store it in secure storage only. */
  refreshToken: RefreshTokenSchema,
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

/** Body of `POST /api/v1/auth/refresh`. */
export const RefreshRequestSchema = z.object({
  refreshToken: RefreshTokenSchema,
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
