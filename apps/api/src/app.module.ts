import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { createValidationPipe } from './common/validation.pipe.js';
import { validateEnv } from './config/env.schema.js';
import { RATE_LIMIT } from './config/rate-limit.js';
import { HealthModule } from './health/health.module.js';
import { MoviesModule } from './movies/movies.module.js';

/** Root module: configuration, rate limiting, feature modules and global request handling. */
@Module({
  imports: [
    // Loads apps/api/.env, validates every variable and fails the boot if any
    // is invalid. `isGlobal` makes ConfigService injectable in every module.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests pass fake values through process.env and must never load a
      // developer's real token from the env file.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    ThrottlerModule.forRoot({ throttlers: [RATE_LIMIT] }),
    HealthModule,
    MoviesModule,
  ],
  // Registered as APP_* providers rather than app.useGlobal*() in main.ts, so
  // they also apply in e2e tests and can use dependency injection.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
