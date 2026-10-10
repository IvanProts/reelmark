import type { INestApplication } from '@nestjs/common';

import type { AuthTokens } from '@reelmark/shared';

import { AuthService } from '../../src/auth/auth.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/** Empties every table of the test database. The e2e suites run one at a time, so this is safe. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  await app.get(PrismaService)
    .$executeRaw`TRUNCATE TABLE decisions, movie_translations, movies, refresh_tokens, users`;
}

/**
 * Creates an anonymous account through AuthService directly. Suites that aren't about sign-up use
 * this instead of `POST /auth/anonymous`, whose strict per-IP limit would stop them.
 */
export function signIn(app: INestApplication): Promise<AuthTokens> {
  return app.get(AuthService).signInAnonymously();
}

/** The Authorization header for an access token. */
export function bearer(tokens: AuthTokens): { Authorization: string } {
  return { Authorization: `Bearer ${tokens.accessToken}` };
}
