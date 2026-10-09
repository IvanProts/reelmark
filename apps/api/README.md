# @reelmark/api

The Reelmark REST API, built with NestJS 12 (ESM) on Express. It serves the mobile app a deck of
movie cards in Ukrainian or English. It is the only component that holds secrets and talks to
[TMDB](https://www.themoviedb.org): every endpoint maps to a fixed upstream call with validated
parameters, and TMDB responses are treated as untrusted input. They are size-capped, parsed with zod
and mapped to the shared contract in [`@reelmark/shared`](../../packages/shared) before anything
reaches a client.

## Endpoints

All routes live under `/api/v1`. Every error response has the shared `ApiError` shape
`{ "statusCode": number, "message": string }`.

| Method | Path                  | Query parameters                                                                                                             | Responses                                                                                                                                             |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/movies/deck` | `page`: integer 1–500 written as a plain decimal (`7`, not `07` or `7.0`), default `1`<br>`lang`: `uk` or `en`, default `en` | `200` `DeckResponse`<br>`400` invalid query, message names the field<br>`429` rate limit exceeded<br>`502` TMDB unavailable<br>`500` unexpected error |
| GET    | `/api/v1/health`      | none                                                                                                                         | `200` `{ "status": "ok" }` (never rate-limited)                                                                                                       |

Unknown query parameters are ignored. Unknown routes and unsupported methods answer `404`.

A `DeckResponse` is `{ page, totalPages, items }`, where `totalPages` is at most 500 and each item
is a `MovieCard`: `id`, `title`, `year` (or `null`), `overview`, `posterUrl` (HTTPS, on
`image.tmdb.org`), `rating` (0–10, one decimal) and `genres` (names in the requested language).
Movies without a usable poster are left out.

## Configuration

Environment variables are validated at boot. Invalid configuration stops the process with a
message that names each bad variable, never its value. For local development, copy `.env.example`
to `.env` in this directory.

| Variable            | Required | Default                        | Description                                                                                                                                                          |
| ------------------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMDB_ACCESS_TOKEN` | yes      | none                           | TMDB "API Read Access Token" (sent as a Bearer token), not the short v3 "API Key". At least 32 characters from `A–Z a–z 0–9 . _ -`.                                  |
| `NODE_ENV`          | no       | `development`                  | `development`, `production` or `test`. A process started with `NODE_ENV=test` never loads the env file, and may use a plain-http TMDB on `127.0.0.1` or `localhost`. |
| `HOST`              | no       | `127.0.0.1`                    | Interface to listen on. `127.0.0.1` keeps the API local; `0.0.0.0` exposes it to the local network (e.g. for testing on a physical phone).                           |
| `PORT`              | no       | `3000`                         | Port to listen on, 1–65535.                                                                                                                                          |
| `TMDB_BASE_URL`     | no       | `https://api.themoviedb.org/3` | TMDB API base URL. Must use HTTPS and contain no credentials, query string or fragment.                                                                              |
| `TMDB_TIMEOUT_MS`   | no       | `5000`                         | Time limit for each TMDB request, including reading the body, 100–60000.                                                                                             |

## Architecture

```
src/
  main.ts           entry point: create the app, apply app.setup, listen on HOST:PORT
  app.setup.ts      helmet, /api prefix guard, /api/v1 prefix and versioning (shared with e2e tests)
  app.module.ts     config, rate limiting, global guard, pipe and exception filter
  config/           env schema and rate-limit settings
  common/           exception filter, validation pipe, PublicHttpException, AsyncCache
  tmdb/             TmdbClient (the only code that calls TMDB), response schemas, locale mapping
  movies/           GET /movies/deck: MoviesService and the pure TMDB → MovieCard mapper
  health/           GET /health
```

### Request lifecycle

1. **helmet** sets the security headers. A small middleware answers anything outside `/api` with
   `404`, so every response goes through the exception filter. Express's body parsers then reject
   malformed or oversized bodies (`400`, `413`, `415`).
2. **ThrottlerGuard** applies the global rate limit (60 requests per minute per client IP and
   route). `/health` is exempt.
3. **Validation pipe** parses the query with the shared zod schema (`DeckQuerySchema`). The
   handler receives typed values with defaults applied and unknown keys stripped.
4. **MoviesController → MoviesService** loads the discover page and the genre list in parallel.
5. **TmdbClient** calls one of two fixed TMDB endpoints and validates the response.
6. **Mapper** (`movie-card.mapper.ts`) turns TMDB movies into `MovieCard`s. When a non-English deck
   has blank overviews, MoviesService loads the English version of the same page and the mapper
   fills them in by movie id.
7. **AllExceptionsFilter** turns any error from the steps above into an `ApiError`.

### Caching

`TmdbClient` keeps in-memory caches built on `AsyncCache`, which also lets concurrent identical
requests share one upstream call:

| Data           | Key           | Lifetime                                         |
| -------------- | ------------- | ------------------------------------------------ |
| Discover pages | locale + page | 10 minutes, at most 200 entries; successes only  |
| Genre lists    | locale        | 24 hours; a failure is remembered for 60 seconds |

The English page used to fill missing overviews is an ordinary cached discover page. Caches and
rate-limit counters live in process memory, so running several instances would need a shared
store.

### TMDB as untrusted input

- Requests go only to `TMDB_BASE_URL`, with the token in the `Authorization` header and redirects
  never followed.
- Responses over 2 MB are cut off while downloading.
- The response envelope is validated strictly; each movie is validated on its own, so one malformed
  movie is dropped instead of failing the page. String fields have length caps, and poster paths
  must match TMDB's file-name pattern.
- Any upstream failure (network, timeout, non-2xx, oversized or malformed body) is logged as
  `TMDB GET <path> failed: <reason>` and answered with a generic `502`. A failed genre list or
  English fallback only degrades the deck (no genre names, blank overviews).

## Security notes

- The TMDB token is read only from the environment, sent only as a Bearer header, and never
  appears in URLs, logs or responses.
- Every input is validated against `@reelmark/shared`; unknown query keys are dropped and
  non-canonical numbers are rejected.
- Error bodies never contain stack traces, upstream data or echoed input. Only
  `PublicHttpException` messages reach clients; other 4xx errors get the standard status text.
- Server-side error logs contain the method and request path, never the query string, headers or
  bodies.
- CORS is disabled, as the native app does not need it.
- Rate limiting uses the client IP. Behind a reverse proxy, `trust proxy` must be configured (see
  `main.ts`), otherwise all clients share one bucket.

## Scripts

Run from the repository root with `pnpm --filter @reelmark/api <script>`, or use `pnpm dev:api`,
which also builds `@reelmark/shared` first.

| Script        | Purpose                                                 |
| ------------- | ------------------------------------------------------- |
| `start`       | Start once, compiled by the Nest CLI                    |
| `start:dev`   | Start in watch mode                                     |
| `start:debug` | Start in watch mode with the Node inspector             |
| `build`       | Compile to `dist/`                                      |
| `start:prod`  | Run the compiled app (`node dist/main.js`)              |
| `lint`        | oxlint with type-aware rules                            |
| `typecheck`   | `tsc --noEmit` over sources and tests                   |
| `test`        | Unit tests (Vitest)                                     |
| `test:watch`  | Unit tests in watch mode                                |
| `test:cov`    | Unit tests with coverage                                |
| `test:debug`  | Unit tests under the Node inspector, one file at a time |
| `test:e2e`    | End-to-end tests                                        |

To try the built API without a real token, pass a fake one inline:
`TMDB_ACCESS_TOKEN=test-dummy-token-0123456789abcdef PORT=3999 node dist/main.js`, then
`curl http://127.0.0.1:3999/api/v1/health`.

## Testing

No test calls the real TMDB API, and no test reads a developer's env file: unit tests construct
their dependencies directly, and e2e tests run with `NODE_ENV=test` and fake values.

**Unit tests** (`src/**/*.spec.ts`) cover the env schema, the mapper, `MoviesService`, `AsyncCache`,
the exception filter's log formatting, and `TmdbClient` with a mocked `fetch` (requests, error
handling, per-movie parsing, size cap and caches).

**End-to-end tests** (`test/*.e2e-spec.ts`) boot the real Nest application:

| Suite                 | Covers                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `http-contract`       | Routes, query parameters, response bodies and the `ApiError` shape, with `TmdbClient` faked.                                             |
| `security`            | Hostile input (queries, bodies, methods, paths), security headers and rate limiting, with `TmdbClient` faked.                            |
| `tmdb-integration`    | The real `TmdbClient` and `fetch` against a local fake TMDB: request shape, redirects, failures, parsing, size cap, poster paths, leaks. |
| `lang-cache-fallback` | Languages, the discover and genre caches, and the English overview fallback, through the real client.                                    |
| `env-boot`            | Booting with invalid configuration fails and never prints a provided value.                                                              |

The suites using the real client also check, after every test, that the token never appears in any
log output and that every upstream request was a body-less GET to one of the two fixed endpoints.
