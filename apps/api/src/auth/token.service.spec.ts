import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { decodeProtectedHeader, decodeJwt, SignJWT, UnsecuredJWT } from 'jose';

import type { Env } from '../config/env.schema.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createRefreshToken,
  hashRefreshToken,
  JWT_AUDIENCE,
  JWT_ISSUER,
  TokenService,
} from './token.service.js';

const KEY = 'unit-signing-material-'.repeat(4);
const USER_ID = '6b1f9c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

const tokens = new TokenService(
  new ConfigService<Env, true>({ JWT_SECRET: KEY } as Partial<Env> as Env),
);

function sign(
  claims: { sub?: string; iss?: string; aud?: string; iat?: number; exp?: number },
  options: { alg?: string; key?: string; typ?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT()
    .setProtectedHeader({ alg: options.alg ?? 'HS256', typ: options.typ ?? 'JWT' })
    .setSubject(claims.sub ?? USER_ID)
    .setIssuer(claims.iss ?? JWT_ISSUER)
    .setAudience(claims.aud ?? JWT_AUDIENCE)
    .setIssuedAt(claims.iat ?? now)
    .setExpirationTime(claims.exp ?? now + 60)
    .sign(new TextEncoder().encode(options.key ?? KEY));
}

describe('TokenService access tokens', () => {
  it('signs an HS256 JWT for the user that verifies back to the user id', async () => {
    const token = await tokens.signAccessToken(USER_ID);

    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({ sub: USER_ID, iss: JWT_ISSUER, aud: JWT_AUDIENCE });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(await tokens.verifyAccessToken(token)).toBe(USER_ID);
  });

  it('rejects a token once it has expired', async () => {
    const token = await tokens.signAccessToken(USER_ID);
    const justBefore = new Date(Date.now() + (ACCESS_TOKEN_TTL_SECONDS - 5) * 1000);
    const justAfter = new Date(Date.now() + (ACCESS_TOKEN_TTL_SECONDS + 5) * 1000);

    expect(await tokens.verifyAccessToken(token, justBefore)).toBe(USER_ID);
    expect(await tokens.verifyAccessToken(token, justAfter)).toBeNull();
  });

  it.each<[string, () => Promise<string>]>([
    ['another key', () => sign({}, { key: 'other-key-'.repeat(8) })],
    ['HS512 with the same key', () => sign({}, { alg: 'HS512' })],
    ['HS384 with the same key', () => sign({}, { alg: 'HS384' })],
    [
      'alg "none"',
      () =>
        Promise.resolve(
          new UnsecuredJWT()
            .setSubject(USER_ID)
            .setIssuer(JWT_ISSUER)
            .setAudience(JWT_AUDIENCE)
            .setIssuedAt()
            .setExpirationTime('1m')
            .encode(),
        ),
    ],
    ['a foreign issuer', () => sign({ iss: 'elsewhere' })],
    ['a foreign audience', () => sign({ aud: 'elsewhere' })],
    ['a non-UUID subject', () => sign({ sub: 'admin' })],
    ['an upper-case UUID subject', () => sign({ sub: USER_ID.toUpperCase() })],
    ['another typ', () => sign({}, { typ: 'at+jwt' })],
    ['a past expiry', () => sign({ iat: 1_000, exp: 2_000 })],
    ['garbage', () => Promise.resolve('not.a.jwt')],
  ])('rejects a token with %s', async (_name, make) => {
    expect(await tokens.verifyAccessToken(await make())).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('are 256 random bits in base64url (43 characters), different every time', () => {
    const issued = new Set(Array.from({ length: 100 }, createRefreshToken));

    expect(issued.size).toBe(100);
    for (const token of issued) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('are stored as their hex SHA-256 digest', () => {
    const token = createRefreshToken();

    expect(hashRefreshToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
