import { Module } from '@nestjs/common';

import { TmdbModule } from '../tmdb/tmdb.module.js';
import { MoviesController } from './movies.controller.js';
import { MoviesService } from './movies.service.js';

@Module({
  imports: [TmdbModule],
  controllers: [MoviesController],
  providers: [MoviesService],
})
export class MoviesModule {}
