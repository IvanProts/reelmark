import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';

import { type Me, type UpdateMe, UpdateMeSchema } from '@reelmark/shared';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { MeService } from './me.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** `GET /api/v1/me`: the caller's profile. */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.me.get(user.id);
  }

  /** `PATCH /api/v1/me`: saves the caller's language choice. */
  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body({ schema: UpdateMeSchema }) body: UpdateMe,
  ): Promise<Me> {
    return this.me.update(user.id, body);
  }

  /** `DELETE /api/v1/me`: deletes the caller's account and all of its data. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() user: AuthUser): Promise<void> {
    return this.me.delete(user.id);
  }
}
