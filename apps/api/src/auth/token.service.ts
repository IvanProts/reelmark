import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

import type { Env } from '../config/env.schema.js';

/** Access tokens are short-lived and kept in memory by the app. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh tokens expire 60 days after they are issued (each rotation issues a new one). */
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'reelmark-api';
export const JWT_AUDIENCE = 'reelmark-app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Signs and verifies access tokens, and creates and hashes refresh tokens. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get('JWT_SECRET', { infer: true }));
  }

  /** A signed JWT for `Authorization: Bearer`, valid for ACCESS_TOKEN_TTL_SECONDS. */
  signAccessToken(userId: string): Promise<string> {
    return new SignJWT()
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /**
   * Returns the user id of a valid access token, or null for anything else: a bad signature,
   * another algorithm (including "none"), a foreign issuer or audience, or an expired token.
   */
  async verifyAccessToken(token: string, now = new Date()): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        // Pinning the algorithm stops algorithm-confusion attacks.
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        typ: 'JWT',
        requiredClaims: ['sub', 'iat', 'exp'],
        currentDate: now,
      });
      return typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
    } catch {
      return null;
    }
  }
}

/** A new refresh token: 256 random bits, base64url without padding (43 characters). */
export function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The form a refresh token is stored and looked up in: hex SHA-256. A leaked database holds no
 * usable tokens, and because lookups compare digests, response timing reveals nothing about the
 * token itself, which is what a constant-time comparison protects against.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
