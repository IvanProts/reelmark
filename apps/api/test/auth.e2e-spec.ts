import { createHash, randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';

import { type AuthTokens, AuthTokensSchema } from '@reelmark/shared';

import { AppModule } from '../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../src/app.setup.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/auth/token.service.js';
import { AUTH_ANONYMOUS_RATE_LIMIT, AUTH_REFRESH_RATE_LIMIT } from '../src/config/rate-limit.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/database.js';
import { TEST_SIGNING_KEY } from './support/test-env.js';

/**
 * Accounts and sessions against the real database: anonymous sign-up, access-token checks,
 * refresh-token rotation with reuse detection, and the auth rate limits. Every test gets a fresh
 * app, so rate-limit counters start at zero.
 */

const UNAUTHORIZED = { statusCode: 401, message: 'Unauthorized' };

let app: NestExpressApplication;
let prisma: PrismaService;

beforeEach(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_OPTIONS, logger: false });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  await resetDatabase(app);
});

afterEach(async () => {
  await app.close();
});

function http(): ReturnType<typeof request> {
  return request(app.getHttpServer());
}

async function signUp(): Promise<AuthTokens> {
  const res = await http().post('/api/v1/auth/anonymous').expect(201);
  return AuthTokensSchema.parse(res.body);
}

function refresh(refreshToken: unknown): request.Test {
  return http().post('/api/v1/auth/refresh').send({ refreshToken });
}

function getMe(accessToken: string): request.Test {
  return http().get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
}

/** A token signed like the API's own, with selected parts changed. */
function forgeToken(
  options: { sub?: string; iss?: string; aud?: string; exp?: number; key?: string } = {},
  alg = 'HS256',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT()
    .setProtectedHeader({ alg, typ: 'JWT' })
    .setSubject(options.sub ?? randomUUID())
    .setIssuer(options.iss ?? JWT_ISSUER)
    .setAudience(options.aud ?? JWT_AUDIENCE)
    .setIssuedAt(now - 60)
    .setExpirationTime(options.exp ?? now + 600)
    .sign(new TextEncoder().encode(options.key ?? TEST_SIGNING_KEY));
}

describe('POST /api/v1/auth/anonymous', () => {
  it('creates an account and returns an access and refresh token pair', async () => {
    const tokens = await signUp();

    expect(tokens.expiresIn).toBe(15 * 60);
    expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = await getMe(tokens.accessToken).expect(200);
    expect(await prisma.user.findMany({ select: { id: true } })).toEqual([{ id: me.body.id }]);
  });

  it('stores the refresh token only as its SHA-256 hash', async () => {
    const { refreshToken } = await signUp();

    const stored = await prisma.refreshToken.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(createHash('sha256').update(refreshToken).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
  });

  it(`allows ${AUTH_ANONYMOUS_RATE_LIMIT.limit} sign-ups per IP per hour, then answers 429`, async () => {
    for (let i = 0; i < AUTH_ANONYMOUS_RATE_LIMIT.limit; i++) {
      await http().post('/api/v1/auth/anonymous').expect(201);
    }

    const res = await http().post('/api/v1/auth/anonymous').expect(429);

    expect(res.body).toEqual({ statusCode: 429, message: 'Too Many Requests' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(60);
    expect(await prisma.user.count()).toBe(AUTH_ANONYMOUS_RATE_LIMIT.limit);
  });

  it('marks the response as not storable', async () => {
    const res = await http().post('/api/v1/auth/anonymous').expect(201);

    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('Access tokens', () => {
  it('authenticate the user named in the token', async () => {
    const tokens = await signUp();

    const res = await getMe(tokens.accessToken).expect(200);

    const [user] = await prisma.user.findMany();
    expect(res.body.id).toBe(user?.id);
  });

  it.each<[string, () => Promise<string | undefined>]>([
    ['no Authorization header', () => Promise.resolve(undefined)],
    ['an empty bearer token', () => Promise.resolve('Bearer ')],
    ['another scheme', () => Promise.resolve('Basic dXNlcjpwYXNz')],
    ['a token that is not a JWT', () => Promise.resolve('Bearer not-a-jwt')],
    ['two tokens', async () => `Bearer ${await forgeToken()} ${await forgeToken()}`],
    [
      'an expired token',
      async () => `Bearer ${await forgeToken({ exp: Math.floor(Date.now() / 1000) - 1 })}`,
    ],
    [
      'a token signed with another key',
      async () => `Bearer ${await forgeToken({ key: 'x'.repeat(64) })}`,
    ],
    ['a token signed with HS512', async () => `Bearer ${await forgeToken({}, 'HS512')}`],
    [
      'an unsigned token (alg "none")',
      () =>
        Promise.resolve(
          `Bearer ${new UnsecuredJWT().setSubject(randomUUID()).setIssuer(JWT_ISSUER).setAudience(JWT_AUDIENCE).setIssuedAt().setExpirationTime('10m').encode()}`,
        ),
    ],
    ['a foreign issuer', async () => `Bearer ${await forgeToken({ iss: 'someone-else' })}`],
    ['a foreign audience', async () => `Bearer ${await forgeToken({ aud: 'another-app' })}`],
    ['a subject that is not a user id', async () => `Bearer ${await forgeToken({ sub: 'admin' })}`],
    ['a valid token for a user that does not exist', async () => `Bearer ${await forgeToken()}`],
  ])('are rejected with a uniform 401 for %s', async (_name, header) => {
    const value = await header();
    const req = http().get('/api/v1/me');
    if (value !== undefined) {
      req.set('Authorization', value);
    }

    const res = await req.expect(401);

    expect(res.body).toEqual(UNAUTHORIZED);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('are rejected when the signature was tampered with', async () => {
    const { accessToken } = await signUp();
    const [header, payload, signature = ''] = accessToken.split('.');
    const flipped = `${signature.at(0) === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

    const res = await getMe(`${header}.${payload}.${flipped}`).expect(401);

    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('stop working as soon as the account is deleted', async () => {
    const { accessToken } = await signUp();

    await http().delete('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(204);

    expect((await getMe(accessToken).expect(401)).body).toEqual(UNAUTHORIZED);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and returns a working token pair', async () => {
    const first = await signUp();

    const res = await refresh(first.refreshToken).expect(200);

    const second = AuthTokensSchema.parse(res.body);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await getMe(second.accessToken).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('lets a rotated token be redeemed again while its successor is unused (lost response)', async () => {
    const first = await signUp();
    // The server rotates first → lost, but the response never reaches the device.
    const lost = AuthTokensSchema.parse((await refresh(first.refreshToken).expect(200)).body);

    // On its next start the device presents the old token again: the session survives.
    const recovered = AuthTokensSchema.parse((await refresh(first.refreshToken).expect(200)).body);
    await getMe(recovered.accessToken).expect(200);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);

    // The never-delivered successor no longer works.
    expect((await refresh(lost.refreshToken).expect(401)).body).toEqual(UNAUTHORIZED);
  });

  it('revokes the whole token family when a token is replayed after its successor was used', async () => {
    const first = await signUp();
    const second = AuthTokensSchema.parse((await refresh(first.refreshToken).expect(200)).body);
    const third = AuthTokensSchema.parse((await refresh(second.refreshToken).expect(200)).body);

    // The first token comes back after its successor was used: someone else holds a copy.
    expect((await refresh(first.refreshToken).expect(401)).body).toEqual(UNAUTHORIZED);

    // The legitimate latest token is revoked as well.
    expect((await refresh(third.refreshToken).expect(401)).body).toEqual(UNAUTHORIZED);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('revokes the family when a token is replayed after the family was revoked', async () => {
    const first = await signUp();
    const second = AuthTokensSchema.parse((await refresh(first.refreshToken).expect(200)).body);
    await refresh((await refresh(second.refreshToken).expect(200)).body.refreshToken).expect(200);
    await refresh(first.refreshToken).expect(401); // replay → family revoked

    // Even the predecessor of a revoked, unused token can't revive the family.
    expect((await refresh(second.refreshToken).expect(401)).body).toEqual(UNAUTHORIZED);
  });

  it("doesn't affect other users' sessions when one family is revoked", async () => {
    const victim = await signUp();
    const other = await signUp();
    const next = AuthTokensSchema.parse((await refresh(victim.refreshToken).expect(200)).body);
    await refresh(next.refreshToken).expect(200);
    await refresh(victim.refreshToken).expect(401); // replay → victim's family revoked

    await refresh(other.refreshToken).expect(200);
  });

  it('answers every concurrent refresh with one token, keeping only the last pair valid', async () => {
    const { refreshToken } = await signUp();

    const results = await Promise.all(Array.from({ length: 6 }, () => refresh(refreshToken)));

    // Later redemptions count as retries after a lost response, not as reuse, and none of them
    // fails on a conflict with another.
    expect(results.map((res) => res.status)).toEqual(Array.from({ length: 6 }, () => 200));
    const active = await prisma.refreshToken.findMany({ where: { revokedAt: null } });
    expect(active).toHaveLength(1);
    const latest = results
      .map((res) => AuthTokensSchema.parse(res.body).refreshToken)
      .find((token) => createHash('sha256').update(token).digest('hex') === active[0]?.tokenHash);
    expect(latest).toBeDefined();
    await refresh(latest).expect(200);
  });

  it('rejects an unknown refresh token with 401', async () => {
    const res = await refresh('A'.repeat(43)).expect(401);

    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('rejects an expired refresh token with 401', async () => {
    const { refreshToken } = await signUp();
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await refresh(refreshToken).expect(401)).body).toEqual(UNAUTHORIZED);
  });

  it('rejects the refresh token of a deleted account with 401', async () => {
    const { accessToken, refreshToken } = await signUp();
    await http().delete('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(204);

    expect((await refresh(refreshToken).expect(401)).body).toEqual(UNAUTHORIZED);
  });

  it.each<[string, unknown]>([
    ['a missing token', undefined],
    ['an empty token', ''],
    ['a short token', 'A'.repeat(42)],
    ['a long token', 'A'.repeat(44)],
    ['padding', `${'A'.repeat(42)}=`],
    ['a number', 12345],
  ])('rejects %s with 400 before any lookup', async (_name, refreshToken) => {
    const res = await refresh(refreshToken).expect(400);

    expect(res.body).toEqual({
      statusCode: 400,
      message: expect.stringMatching(/^Invalid request\. refreshToken: /),
    });
  });

  it(`allows ${AUTH_REFRESH_RATE_LIMIT.limit} attempts per IP per minute, then answers 429`, async () => {
    for (let i = 0; i < AUTH_REFRESH_RATE_LIMIT.limit; i++) {
      await refresh('A'.repeat(43)).expect(401);
    }

    await refresh('A'.repeat(43)).expect(429);
  });
});
