import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.schema.js';

/** Process entry point: builds the app, applies the HTTP setup and starts listening. */
async function bootstrap(): Promise<void> {
  // Env validation runs while AppModule is created, so invalid config stops the
  // process here with a message that names the bad variables.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // Behind a reverse proxy, req.ip is the proxy's address and all clients would
  // share one rate-limit bucket. Set the number of trusted hops when deploying
  // behind one, e.g. app.set('trust proxy', 1).

  // Runs onModuleDestroy / onApplicationShutdown hooks on SIGTERM and SIGINT.
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const host = config.get('HOST', { infer: true });
  const port = config.get('PORT', { infer: true });

  await app.listen(port, host);
  new Logger('Bootstrap').log(`API listening on http://${host}:${port}/api/v1`);
}

await bootstrap();
