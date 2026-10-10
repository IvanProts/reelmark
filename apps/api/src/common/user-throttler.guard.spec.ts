import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

import { UserThrottlerGuard } from './user-throttler.guard.js';

/** Exposes the protected tracker for testing. */
class TestableGuard extends UserThrottlerGuard {
  tracker(request: Record<string, unknown>): Promise<string> {
    return this.getTracker(request);
  }
}

const guard = new TestableGuard(
  { throttlers: [] } as ThrottlerModuleOptions,
  {} as ThrottlerStorage,
  new Reflector(),
);

describe('UserThrottlerGuard', () => {
  it('counts authenticated requests per user', async () => {
    expect(await guard.tracker({ ip: '203.0.113.7', user: { id: 'u-1' } })).toBe('user:u-1');
  });

  it('counts anonymous requests per client IP', async () => {
    expect(await guard.tracker({ ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
  });
});
