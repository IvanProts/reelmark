import { HttpException, type HttpStatus } from '@nestjs/common';

/**
 * An HttpException whose message is safe to show to API clients.
 *
 * The global AllExceptionsFilter replaces the message of every other 4xx
 * error with the standard status text ("Not Found", "Bad Request"…), because
 * built-in messages can echo raw request data back. Throw this one when the
 * client should see a specific explanation.
 *
 * Never put user input, upstream data or secrets into the message.
 */
export class PublicHttpException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super(message, status);
  }
}
