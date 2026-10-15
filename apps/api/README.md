# @reelmark/api

The Reelmark REST API, built with NestJS 12 (ESM) on Express, Prisma 7 and PostgreSQL 17. It gives
the mobile app anonymous accounts, a deck of movie cards in Ukrainian or English, saved swipe
decisions, a library and movie details. It is the only component that holds secrets and talks to
[TMDB](https://www.themoviedb.org) and [Wikidata](https://www.wikidata.org): every endpoint maps to a fixed upstream call with validated
parameters, TMDB responses are treated as untrusted input, and everything is mapped to the shared
contract in [`@reelmark/shared`](../../packages/shared) before it reaches a client.

## Endpoints

All routes live under `/api/v1`. Every route except `/health` and `/auth/*` requires
`Authorization: Bearer <accessToken>`. Every error response has the shared `ApiError` shape
`{ "statusCode": number, "message": string }`; every authentication failure is the same
`401 { "statusCode": 401, "message": "Unauthorized" }`.

| Method | Path                       | Input                                                                                   | Success                                                             |
| ------ | -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| POST   | `/auth/anonymous`          | none                                                                                    | `201` `AuthTokens` (new account)                                    |
| POST   | `/auth/refresh`            | `{ refreshToken }`                                                                      | `200` `AuthTokens` (the refresh token is rotated)                   |
| GET    | `/movies/deck`             | `page`: 1–500, default 1 · `lang`: `uk` \| `en`, default `en`                           | `200` `DeckResponse` without the caller's sorted movies             |
| GET    | `/movies/:movieId/details` | `lang`: `uk` \| `en`, default `en` · `region`: `UA`, `US`, … (ISO 3166-1), default `US` | `200` `MovieDetails`; `404` if TMDB has no such movie               |
| GET    | `/me`                      | none                                                                                    | `200` `Me`                                                          |
| PATCH  | `/me`                      | `{ locale }`                                                                            | `200` `Me`                                                          |
| DELETE | `/me`                      | none                                                                                    | `204`; the account and all its data are deleted                     |
| PUT    | `/me/decisions/:movieId`   | `{ status: "seen" \| "not_seen" \| "want", liked? }` (`liked` only for `seen`)          | `200` `Decision`; `404` if the movie was never in a deck or details |
| DELETE | `/me/decisions/:movieId`   | none                                                                                    | `204`, also when there was no decision                              |
| GET    | `/me/library`              | `status`: `seen` \| `want` · `lang` · `limit`: 1–60, default 30 · `cursor`              | `200` `LibraryPage`, newest decision first                          |
| GET    | `/health`                  | none                                                                                    | `200` `{ "status": "ok" }`                                          |

Other responses: `400` invalid input (the message names the field), `401`, `413` body over 16 KB,
`415` non-JSON body, `429` rate limit, `502` TMDB unavailable, `500` unexpected error. Integers in
queries and paths must be written canonically (`7`, not `07` or `7.0`); unknown query parameters are
ignored. Unknown routes and unsupported methods answer `404`.

A deck page can hold fewer cards than TMDB's page, even none, because sorted movies are left out;
the app then asks for the next page.

Movie details work for any TMDB movie id (with a poster), not only movies already served in a deck:

- `movie` is the `MovieCard`; a blank overview is taken from English.
- `trailer` is an official YouTube trailer in `lang`, then in English, then an unofficial one;
  only the 11-character video id is sent. `null` when there is none.
- `certification` is the region's age rating, or the US one when the region has none.
- `cast` is the top five billed actors; `directors` come from the crew.
- `watch` lists the region's streaming (`stream`), `rent` and `buy` offers (data by JustWatch,
  which the app credits), with logos on `image.tmdb.org` and a `link` only to `www.themoviedb.org`.
- `critics` holds the latest Rotten Tomatoes and Metacritic scores from Wikidata (0–100), each
  `null` when unknown or when Wikidata is unavailable; Wikidata never fails the request.

## Configuration

Environment variables are validated at boot. Invalid configuration stops the process with a
message that names each bad variable, never its value. `pnpm setup:env` (repository root) creates
`apps/api/.env` from `.env.example` and generates the database password and JWT secret.

| Variable              | Required | Default                             | Description                                                                                                                                         |
| --------------------- | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TMDB_ACCESS_TOKEN`   | yes      | none                                | TMDB "API Read Access Token" (sent as a Bearer token), not the short v3 "API Key". At least 32 characters from `A–Z a–z 0–9 . _ -`.                 |
| `DATABASE_URL`        | yes      | none                                | PostgreSQL connection URL (`postgresql://…`).                                                                                                       |
| `JWT_SECRET`          | yes      | none                                | Key that signs access tokens: at least 64 characters of hex or base64 (32 random bytes).                                                            |
| `NODE_ENV`            | no       | `development`                       | `development`, `production` or `test`. A process started with `NODE_ENV=test` never loads the env file, and may use a plain-http TMDB on localhost. |
| `HOST`                | no       | `127.0.0.1`                         | Interface to listen on. `0.0.0.0` exposes the API to the local network (e.g. for a physical phone).                                                 |
| `PORT`                | no       | `3000`                              | Port to listen on, 1–65535.                                                                                                                         |
| `TMDB_BASE_URL`       | no       | `https://api.themoviedb.org/3`      | TMDB API base URL. Must use HTTPS and contain no credentials, query string or fragment.                                                             |
| `TMDB_TIMEOUT_MS`     | no       | `5000`                              | Time limit for each TMDB request, including reading the body, 100–60000.                                                                            |
| `WIKIDATA_SPARQL_URL` | no       | `https://query.wikidata.org/sparql` | Wikidata SPARQL endpoint for critics' scores (also limited by `TMDB_TIMEOUT_MS`). Same rules as `TMDB_BASE_URL`.                                    |

## Data model

Schema and migrations live in `prisma/`; `prisma.config.ts` configures the Prisma CLI and loads
`apps/api/.env` when it exists (variables already set in the environment win). The Prisma Client
is generated into `src/generated/prisma` (git-ignored) by `pnpm db:generate`; `build`, `start*` and
the Turborepo tasks generate it automatically, without needing a database.

| Table                | Key                     | Contents                                                                                        |
| -------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `users`              | `id` (UUID)             | Anonymous account; `locale` is the chosen language or null.                                     |
| `refresh_tokens`     | `id`; `token_hash` UK   | SHA-256 of each refresh token, its `family_id`, expiry and revocation time.                     |
| `movies`             | TMDB `id`               | Catalog of served movies: poster path, year, rating, genre ids. Written only from TMDB data.    |
| `movie_translations` | (`movie_id`, `locale`)  | Title and overview per language.                                                                |
| `decisions`          | (`user_id`, `movie_id`) | `seen` / `not_seen` / `want`, `liked` (only for `seen`), `updated_at`. Indexed for the library. |

Deleting a user cascades to their refresh tokens and decisions; the shared catalog stays.

## Authentication

- `POST /auth/anonymous` creates a user and a token family, and returns an access token and a
  refresh token.
- **Access tokens** are HS256 JWTs (`jose`) valid for 15 minutes, with `sub` (user id), `iss`,
  `aud`, `iat` and `exp`. Verification pins the algorithm, issuer, audience and `typ`, and requires
  every claim. The global `AuthGuard` also checks that the user still exists, so a deleted account
  loses access immediately. Routes read the user only through `@CurrentUser()`.
- **Refresh tokens** are 256 random bits (base64url, 43 characters), stored only as SHA-256 hashes
  and valid for 60 days. Every refresh revokes the presented token and issues a new one in the same
  family. Presenting a revoked token again, or the same token in two concurrent requests, revokes
  the whole family: every device using it has to sign in again.

## Architecture

```
src/
  main.ts           entry point: create the app, apply app.setup, listen on HOST:PORT
  app.setup.ts      helmet, no-store, /api prefix guard, JSON-only body parsing, /api/v1 routing
  app.module.ts     config, database, rate limiting, global guards, pipe and exception filter
  config/           env schema and rate-limit settings
  prisma/           PrismaService (Prisma 7 + the pg driver adapter)
  auth/             anonymous sign-in, token rotation, AuthGuard, @Public(), @CurrentUser()
  me/               GET / PATCH / DELETE /me
  decisions/        PUT / DELETE /me/decisions/:movieId
  library/          GET /me/library with keyset cursors
  movies/           GET /movies/deck, GET /movies/:movieId/details and their mappers
  catalog/          stores served movies for decisions and the library
  tmdb/             TmdbClient (the only code that calls TMDB), response schemas, locale mapping
  wikidata/         WikidataClient (critics' scores via one fixed SPARQL query) and its parsing
  common/           exception filter, validation pipe, per-user throttler guard, AsyncCache
  health/           GET /health
```

### Request lifecycle

1. **Express middleware:** helmet sets the security headers and every response gets
   `Cache-Control: no-store`. Anything outside `/api` is answered with `404`. Bodies that aren't
   JSON get `415` before anything parses them, and JSON bodies are capped at 16 KB (`413`).
2. **AuthGuard** verifies the access token on every route not marked `@Public()`.
3. **UserThrottlerGuard** applies the rate limits, per user on authenticated routes and per IP on
   the others.
4. **Validation pipe** parses route params, queries and bodies with the shared zod schemas.
5. **Controllers → services** call TmdbClient and Prisma; the mappers build `MovieCard`s.
6. **AllExceptionsFilter** turns any error from the steps above into an `ApiError`.

### Deck, catalog and library

For a deck, `MoviesService` loads the TMDB page and genre list (in parallel), maps the movies to
cards and, when a non-English card has a blank overview, borrows it from the English page. It then
saves the page to the catalog (movie data plus the texts in that language, and English texts when
the English page was loaded) and leaves out the movies the caller has already sorted.

Library pages come from the database alone: the caller's decisions of one status, ordered by
`(updated_at desc, movie_id desc)`, paged with an opaque base64url cursor over that pair. Cards use
the requested language; a blank overview falls back to English, and genre names come from the
cached TMDB genre list.

### Caching

`TmdbClient`, `MovieDetailsService` and `WikidataClient` keep in-memory caches built on
`AsyncCache`, which also lets concurrent identical requests share one upstream call:

| Data            | Key                      | Lifetime                                                             |
| --------------- | ------------------------ | -------------------------------------------------------------------- |
| Discover pages  | locale + page            | 10 minutes, at most 200 entries; successes only                      |
| Genre lists     | locale                   | 24 hours; a failure is remembered for 60 seconds                     |
| Movie details   | movie id + lang + region | 24 hours, at most 1000 entries; successes only                       |
| Critics' scores | movie id                 | 7 days, at most 5000 entries; a failure is remembered for 10 minutes |

Caches and rate-limit counters live in process memory, so running several instances would need a
shared store.

### TMDB as untrusted input

- Requests go only to `TMDB_BASE_URL`, with the token in the `Authorization` header and redirects
  never followed.
- Responses over 2 MB are cut off while downloading.
- The response envelope is validated strictly; each movie is validated on its own, so one malformed
  movie is dropped instead of failing the page. String fields have length caps, and poster paths
  must match TMDB's file-name pattern.
- Any upstream failure is logged as `TMDB GET <path> failed: <reason>` and answered with a generic
  `502`. A failed genre list or English fallback only degrades the deck. TMDB's 404 for a movie's
  details is answered with a generic `404`.
- The appended details sections (videos, credits, release dates, watch providers) are validated
  item by item, so a malformed entry is dropped and a malformed section counts as empty. Trailer
  ids must match `^[A-Za-z0-9_-]{11}$`, logos must be TMDB image paths, and where-to-watch links
  must be `https://www.themoviedb.org/…`.
- Wikidata gets the same treatment: one fixed query whose only variable is the validated integer
  id, a descriptive `User-Agent`, no redirects, the `TMDB_TIMEOUT_MS` limit, a 256 KB cap and zod
  parsing. A failure is logged as `Wikidata scores for movie <id> unavailable: <reason>` and gives
  null scores.

## Security notes

- The user id comes only from a verified access token. No route accepts a user id as input, so a
  user can never read or change another user's data.
- JWT verification pins HS256, the issuer, the audience and `typ`, and checks expiry;
  `JWT_SECRET` is validated at boot.
- Refresh tokens are stored as SHA-256 hashes and looked up by hash, so neither a database leak nor
  response timing reveals a usable token; rotation with reuse detection revokes stolen families.
- Rate limits: 60 requests per minute per user (or per IP when anonymous) on each route;
  `/auth/anonymous` 10 per hour per IP; `/auth/refresh` 10 per minute per IP. Behind a reverse
  proxy, `trust proxy` must be configured (see `main.ts`), otherwise all clients share one IP.
- Request bodies are JSON only, at most 16 KB; form and multipart parsing are disabled.
- Every response is `Cache-Control: no-store`. CORS is disabled, as the native app doesn't need it.
- Every input is validated against `@reelmark/shared`. Error bodies never contain stack traces,
  upstream data or echoed input; server logs name the method and path, never the query string,
  headers, bodies or tokens.
- All database access goes through Prisma (parameterised). The local database listens on
  `127.0.0.1` only, and its credentials live in git-ignored env files.

## Scripts

Run from the repository root with `pnpm --filter @reelmark/api <script>`, or use `pnpm dev:api`.
Start the local database first with `pnpm db:up`.

| Script        | Purpose                                                 |
| ------------- | ------------------------------------------------------- |
| `start`       | Start once, compiled by the Nest CLI                    |
| `start:dev`   | Start in watch mode                                     |
| `start:debug` | Start in watch mode with the Node inspector             |
| `build`       | Generate the Prisma Client and compile to `dist/`       |
| `start:prod`  | Run the compiled app (`node dist/main.js`)              |
| `db:generate` | Generate the Prisma Client                              |
| `db:migrate`  | Create and apply migrations in development              |
| `db:deploy`   | Apply pending migrations (deployments)                  |
| `db:studio`   | Browse the database in Prisma Studio                    |
| `lint`        | oxlint with type-aware rules                            |
| `typecheck`   | `tsc --noEmit` over sources and tests                   |
| `test`        | Unit tests (Vitest)                                     |
| `test:watch`  | Unit tests in watch mode                                |
| `test:cov`    | Unit tests with coverage                                |
| `test:debug`  | Unit tests under the Node inspector, one file at a time |
| `test:e2e`    | End-to-end tests (need the database from `pnpm db:up`)  |

## Testing

No test calls the real TMDB API or Wikidata, or reads a developer's env file.

**Unit tests** (`src/**/*.spec.ts`) cover the env schema, token service, auth guard, throttler
tracker, library cursor, mappers (cards, details), critics' score parsing, `MoviesService`, `AsyncCache`, the exception filter's log
formatting, and `TmdbClient` with a mocked `fetch`.

**End-to-end tests** (`test/*.e2e-spec.ts`) boot the real Nest application against the
`reelmark_test` database. A global setup applies the migrations with `prisma migrate deploy`; the
suites run one at a time and empty the tables between tests.

| Suite                 | Covers                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http-contract`       | Routes, query parameters, response bodies and the `ApiError` shape, with `TmdbClient` faked.                                                         |
| `auth`                | Sign-up, forged and expired access tokens, refresh rotation, reuse and concurrency, deleted accounts, auth rate limits.                              |
| `account`             | `/me`, decisions, the library and its cursor, deck exclusion, catalog writes, isolation between users, deletion cascade, body limits.                |
| `security`            | Hostile input (queries, bodies, methods, paths), security headers and rate limiting, with `TmdbClient` faked.                                        |
| `tmdb-integration`    | The real `TmdbClient` and `fetch` against a local fake TMDB: request shape, redirects, failures, parsing, size cap, poster paths, leaks.             |
| `lang-cache-fallback` | Languages, the discover and genre caches, and the English overview fallback, through the real client.                                                |
| `movie-details`       | Movie details through the real TMDB and Wikidata clients against local fakes: contract, validation, 404, Wikidata failures, caching, catalog, leaks. |
| `env-boot`            | Booting with invalid configuration fails and never prints a provided value.                                                                          |
