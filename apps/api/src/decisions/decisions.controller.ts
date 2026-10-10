import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  type Decision,
  type MovieIdParams,
  MovieIdParamsSchema,
  type SaveDecision,
  SaveDecisionSchema,
} from '@reelmark/shared';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { DECISIONS_RATE_LIMIT } from '../config/rate-limit.js';
import { DecisionsService } from './decisions.service.js';

@Throttle({ default: DECISIONS_RATE_LIMIT })
@Controller('me/decisions')
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  /** `PUT /api/v1/me/decisions/:movieId`: saves (or replaces) the caller's decision. */
  @Put(':movieId')
  save(
    @CurrentUser() user: AuthUser,
    @Param({ schema: MovieIdParamsSchema }) params: MovieIdParams,
    @Body({ schema: SaveDecisionSchema }) body: SaveDecision,
  ): Promise<Decision> {
    return this.decisions.save(user.id, params.movieId, body);
  }

  /** `DELETE /api/v1/me/decisions/:movieId`: undoes the caller's decision. */
  @Delete(':movieId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: MovieIdParamsSchema }) params: MovieIdParams,
  ): Promise<void> {
    return this.decisions.remove(user.id, params.movieId);
  }
}
