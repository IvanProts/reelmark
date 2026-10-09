import { Module } from '@nestjs/common';

import { TmdbClient } from './tmdb.client.js';

/** Provides TmdbClient to the modules that import it. */
@Module({
  providers: [TmdbClient],
  exports: [TmdbClient],
})
export class TmdbModule {}
