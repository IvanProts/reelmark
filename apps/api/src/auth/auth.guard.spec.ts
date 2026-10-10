import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { Public } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import type { TokenService } from './token.service.js';

const USER_ID = '6b1f9c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const VALID = 'header.payload.signature';

@Public()
class PublicController {}
class PrivateController {}

function contextFor(
  request: Partial<AuthenticatedRequest>,
  controller: object = PrivateController,
): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(existingUsers: string[] = [USER_ID]) {
  const tokens = {
    verifyAccessToken: vi.fn((token: string) => Promise.resolve(token === VALID ? USER_ID : null)),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(existingUsers.includes(where.id) ? { id: where.id } : null),
      ),
    },
  };
  const authGuard = new AuthGuard(
    new Reflector(),
    tokens as unknown as TokenService,
    prisma as unknown as PrismaService,
  );
  return { authGuard, tokens, prisma };
}

describe('AuthGuard', () => {
  it('lets @Public() routes through without a token', async () => {
    const { authGuard, tokens } = guard();

    await expect(
      authGuard.canActivate(contextFor({ headers: {} }, PublicController)),
    ).resolves.toBe(true);
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('sets the user from a valid bearer token of an existing user', async () => {
    const { authGuard } = guard();
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${VALID}` },
    };

    await expect(authGuard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual({ id: USER_ID });
  });

  it('accepts the scheme in any letter case', async () => {
    const { authGuard } = guard();

    await expect(
      authGuard.canActivate(contextFor({ headers: { authorization: `bearer ${VALID}` } })),
    ).resolves.toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another scheme', `Basic ${VALID}`],
    ['a missing token', 'Bearer '],
    ['two tokens', `Bearer ${VALID} ${VALID}`],
    ['characters outside a JWT', `Bearer ${VALID}<script>`],
    ['an oversized token', `Bearer ${'a'.repeat(4097)}`],
    ['an invalid token', 'Bearer forged.token.value'],
  ])('rejects %s with 401', async (_name, authorization) => {
    const { authGuard } = guard();
    const request: Partial<AuthenticatedRequest> = { headers: { authorization } };

    await expect(authGuard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const { authGuard } = guard([]);

    await expect(
      authGuard.canActivate(contextFor({ headers: { authorization: `Bearer ${VALID}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
