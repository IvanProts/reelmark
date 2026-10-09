import { STATUS_CODES } from 'node:http';

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import type { ApiError } from '@reelmark/shared';

import { PublicHttpException } from './public-http.exception.js';

/** Request paths are client-controlled, so log lines cut them at this length. */
const MAX_LOGGED_PATH_LENGTH = 200;

/**
 * Catches every error (`@Catch()` with no arguments) and answers with the
 * shared `ApiError` body, `{ statusCode, message }`.
 *
 * - 4xx: only `PublicHttpException` messages pass through; everything else gets
 *   the standard status text, because built-in messages can contain raw
 *   request data (Nest's 404 says "Cannot GET /<path>", JSON parse errors
 *   quote the body).
 * - 5xx and unknown errors: a generic message for the client; details go to
 *   the server log only. Stack traces never reach the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // HttpAdapterHost exposes the underlying HTTP library (Express) without
  // depending on it directly.
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const statusCode = statusCodeOf(exception);

    if (statusCode >= 500) {
      const request: unknown = ctx.getRequest();
      const route = `${httpAdapter.getRequestMethod(request)} ${loggablePath(httpAdapter.getRequestUrl(request))}`;
      this.logServerError(exception, statusCode, route);
    }

    const body: ApiError = {
      statusCode,
      message: clientMessage(exception, statusCode),
    };
    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }

  private logServerError(exception: unknown, statusCode: number, route: string): void {
    if (exception instanceof HttpException) {
      // An expected failure (e.g. TmdbClient's 502, whose cause is already
      // logged), so one line without a stack trace is enough.
      this.logger.warn(`${route} -> ${statusCode}: ${exception.message}`);
      return;
    }
    // A bug or an unexpected failure: keep the stack trace, in the log only.
    this.logger.error(
      `${route} -> ${statusCode}: unhandled error`,
      exception instanceof Error ? exception.stack : String(exception),
    );
  }
}

/**
 * Formats a request URL for a log line: the path only (the query string is
 * client input and may carry anything), cut to MAX_LOGGED_PATH_LENGTH.
 */
export function loggablePath(url: string): string {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path.length > MAX_LOGGED_PATH_LENGTH ? `${path.slice(0, MAX_LOGGED_PATH_LENGTH)}…` : path;
}

function statusCodeOf(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  // Express middleware (e.g. the body parser rejecting an oversized body with
  // 413) reports client errors via the `http-errors` convention: a numeric
  // `status` plus `expose: true`.
  if (isExposedClientError(exception)) {
    return exception.status;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function isExposedClientError(error: unknown): error is { status: number } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}

function clientMessage(exception: unknown, statusCode: number): string {
  if (statusCode < 500 && exception instanceof PublicHttpException) {
    return exception.message;
  }
  return STATUS_CODES[statusCode] ?? 'Error';
}
