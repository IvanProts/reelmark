import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/** `GET /api/v1/health`: liveness check for uptime monitors and load balancers. */
@SkipThrottle() // monitors poll often and must never be rate-limited
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
