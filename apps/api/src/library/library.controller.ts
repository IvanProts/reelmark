import { Controller, Get, Query } from '@nestjs/common';

import { type LibraryPage, type LibraryQuery, LibraryQuerySchema } from '@reelmark/shared';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { LibraryService } from './library.service.js';

@Controller('me/library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  /** `GET /api/v1/me/library?status=seen|want&lang&cursor&limit`: one page of the caller's library. */
  @Get()
  page(
    @CurrentUser() user: AuthUser,
    @Query({ schema: LibraryQuerySchema }) query: LibraryQuery,
  ): Promise<LibraryPage> {
    return this.library.page(user.id, query);
  }
}
