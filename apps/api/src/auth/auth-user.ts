import type { Request } from 'express';

/** The caller of an authenticated route. Its id comes only from a verified access token. */
export interface AuthUser {
  id: string;
}

/** A request after AuthGuard: `user` is set on every route that isn't `@Public()`. */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
