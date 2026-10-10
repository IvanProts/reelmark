import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import type { AuthenticatedRequest } from '../auth/auth-user.js';

/**
 * The throttler, keyed by user id on authenticated routes and by client IP otherwise. It runs
 * after AuthGuard, which sets the user, so one user can't spread requests over many IPs and many
 * users behind one NAT don't share a budget.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const { user } = request as unknown as AuthenticatedRequest;
    return user ? `user:${user.id}` : `ip:${await super.getTracker(request)}`;
  }
}
