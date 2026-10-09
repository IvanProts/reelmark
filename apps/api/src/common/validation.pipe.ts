import { HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common';

import { PublicHttpException } from './public-http.exception.js';

/**
 * Creates the global pipe that validates every route parameter declared with a
 * Standard Schema, e.g. `@Query({ schema: DeckQuerySchema })`. Handlers receive
 * the schema's output (coerced values, defaults applied, unknown keys
 * stripped); invalid input is answered with a 400.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      // e.g. "page: Too small: expected number to be >=1". Safe to send back:
      // field names come from our schemas (z.object strips unknown keys, so a
      // client can't inject one), and zod messages describe what was expected,
      // never the received value.
      const details = issues.map(({ path, message }) => {
        const field = (path ?? [])
          .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
          .join('.');
        return field ? `${field}: ${message}` : message;
      });
      return new PublicHttpException(
        `Invalid request. ${details.join('; ')}`,
        HttpStatus.BAD_REQUEST,
      );
    },
  });
}
