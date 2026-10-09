import { type INestApplication, NotFoundException, VersioningType } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

const API_PREFIX = 'api';

/**
 * HTTP-level setup shared by main.ts and the e2e tests, so the tests exercise
 * the same app that runs in production. Call it before `app.init()` or
 * `app.listen()`.
 */
export function configureApp(app: INestApplication): void {
  // Security headers (X-Content-Type-Options, HSTS, CSP, …); also removes the
  // X-Powered-By header.
  app.use(helmet());

  // Nest's JSON 404 only covers paths inside the global prefix; Express would
  // answer anything else with its own HTML page. Rejecting those requests here
  // routes them through AllExceptionsFilter as well.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const isApiPath = req.path === `/${API_PREFIX}` || req.path.startsWith(`/${API_PREFIX}/`);
    next(isApiPath ? undefined : new NotFoundException());
  });

  // Every route lives under /api/v1/…, so a breaking change can ship as /api/v2
  // while older app builds keep using v1.
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // CORS stays disabled (Nest's default): it only matters to browsers, and the
  // native app doesn't need it. A future web client gets an explicit origin
  // allowlist, never `origin: '*'`.
}
