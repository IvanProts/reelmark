import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { TokenService } from './token.service.js';

/** `Authorization: Bearer <JWT>`; the length cap keeps absurd headers away from the verifier. */
const BEARER = /^Bearer ([A-Za-z0-9._-]{1,4096})$/i;

/**
 * Global guard: every route requires a valid access token unless it is marked `@Public()`.
 * Every failure gets the same 401 body, so a client can't tell a missing token from a forged,
 * expired or deleted user's one.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    const userId = token ? await this.tokens.verifyAccessToken(token) : null;
    // A deleted account loses access at once, not when its last access token expires.
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      : null;
    if (!user) {
      throw new UnauthorizedException();
    }

    request.user = { id: user.id };
    return true;
  }
}
