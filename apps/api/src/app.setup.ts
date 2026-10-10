import {
  type NestApplicationOptions,
  NotFoundException,
  UnsupportedMediaTypeException,
  VersioningType,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

const API_PREFIX = 'api';

/** Request bodies are small JSON documents; nothing legitimate comes close to this. */
const MAX_BODY_SIZE = '16kb';

/**
 * Options for `NestFactory.create()` and `createNestApplication()`. Nest's default body parsers
 * (JSON and form) are off; configureApp installs a JSON-only parser instead.
 */
export const APP_OPTIONS = { bodyParser: false } satisfies NestApplicationOptions;

/**
 * HTTP-level setup shared by main.ts and the e2e tests, so the tests exercise
 * the same app that runs in production. Call it before `app.init()` or
 * `app.listen()`.
 */
export function configureApp(app: NestExpressApplication): void {
  // Security headers (X-Content-Type-Options, HSTS, CSP, …); also removes the
  // X-Powered-By header.
  app.use(helmet());

  // Every response is user-specific or not worth caching, so no browser or
  // proxy may store any of them (tokens, profiles, decks, errors).
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Nest's JSON 404 only covers paths inside the global prefix; Express would
  // answer anything else with its own HTML page. Rejecting those requests here
  // routes them through AllExceptionsFilter as well.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const isApiPath = req.path === `/${API_PREFIX}` || req.path.startsWith(`/${API_PREFIX}/`);
    next(isApiPath ? undefined : new NotFoundException());
  });

  // JSON is the only body format: any other body is refused before anything
  // parses it, so form or multipart parsers never run.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const unsupported = hasBody(req) && !req.is('application/json');
    next(unsupported ? new UnsupportedMediaTypeException() : undefined);
  });
  app.useBodyParser('json', { limit: MAX_BODY_SIZE });

  // Every route lives under /api/v1/…, so a breaking change can ship as /api/v2
  // while older app builds keep using v1.
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // CORS stays disabled (Nest's default): it only matters to browsers, and the
  // native app doesn't need it. A future web client gets an explicit origin
  // allowlist, never `origin: '*'`.
}

function hasBody(req: Request): boolean {
  return (
    req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0
  );
}
