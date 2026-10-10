import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../auth/auth.decorators.js';

/** `GET /api/v1/health`: liveness check for uptime monitors and load balancers. */
@Public()
@SkipThrottle() // monitors poll often and must never be rate-limited
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
