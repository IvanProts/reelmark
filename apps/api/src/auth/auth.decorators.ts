import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest, AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Marks a route or controller as reachable without an access token; AuthGuard skips it. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Injects the authenticated caller, as verified by AuthGuard. Route handlers take the user id
 * from here only, never from a parameter or body, so no one can act on another user's data.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      // Only possible on a @Public() route, which must not use @CurrentUser().
      throw new UnauthorizedException();
    }
    return user;
  },
);
