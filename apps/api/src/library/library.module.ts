import { Module } from '@nestjs/common';

import { TmdbModule } from '../tmdb/tmdb.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';

@Module({
  imports: [TmdbModule],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
