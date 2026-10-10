import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { type AuthTokens, type RefreshRequest, RefreshRequestSchema } from '@reelmark/shared';

import { AUTH_ANONYMOUS_RATE_LIMIT, AUTH_REFRESH_RATE_LIMIT } from '../config/rate-limit.js';
import { Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** `POST /api/v1/auth/anonymous`: creates an account and returns its first token pair. */
  @Post('anonymous')
  @Throttle({ default: AUTH_ANONYMOUS_RATE_LIMIT })
  signInAnonymously(): Promise<AuthTokens> {
    return this.auth.signInAnonymously();
  }

  /** `POST /api/v1/auth/refresh`: rotates the refresh token and returns a new pair. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_REFRESH_RATE_LIMIT })
  refresh(@Body({ schema: RefreshRequestSchema }) body: RefreshRequest): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken);
  }
}
