import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { UserThrottlerGuard } from './common/user-throttler.guard.js';
import { createValidationPipe } from './common/validation.pipe.js';
import { validateEnv } from './config/env.schema.js';
import { RATE_LIMIT } from './config/rate-limit.js';
import { DecisionsModule } from './decisions/decisions.module.js';
import { HealthModule } from './health/health.module.js';
import { LibraryModule } from './library/library.module.js';
import { MeModule } from './me/me.module.js';
import { MoviesModule } from './movies/movies.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/** Root module: configuration, database, feature modules and global request handling. */
@Module({
  imports: [
    // Loads apps/api/.env, validates every variable and fails the boot if any
    // is invalid. `isGlobal` makes ConfigService injectable in every module.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests pass fake values through process.env and must never load a
      // developer's real secrets from the env file.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    ThrottlerModule.forRoot({ throttlers: [RATE_LIMIT] }),
    PrismaModule,
    AuthModule,
    HealthModule,
    MoviesModule,
    MeModule,
    DecisionsModule,
    LibraryModule,
  ],
  // Registered as APP_* providers rather than app.useGlobal*() in main.ts, so
  // they also apply in e2e tests and can use dependency injection. Global
  // guards run in this order: authentication first, so the throttler can count
  // requests per user.
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
