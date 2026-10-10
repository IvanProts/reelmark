import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module.js';
import { DecisionsModule } from '../decisions/decisions.module.js';
import { TmdbModule } from '../tmdb/tmdb.module.js';
import { MoviesController } from './movies.controller.js';
import { MoviesService } from './movies.service.js';

@Module({
  imports: [TmdbModule, CatalogModule, DecisionsModule],
  controllers: [MoviesController],
  providers: [MoviesService],
})
export class MoviesModule {}
