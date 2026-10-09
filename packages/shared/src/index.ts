export * from './auth.js';
export * from './library.js';
export * from './movies.js';

/** Error body returned by the API for any non-2xx response. */
export interface ApiError {
  statusCode: number;
  message: string;
}
