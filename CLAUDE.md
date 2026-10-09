# Reelmark

Reelmark — Tinder-style movie library: swipe to build your library (seen / not seen / want),
get recommendations. Learning project for NestJS + React Native, iOS + Android.

## Layout

- `apps/api` — NestJS 12 (ESM, Vitest, oxlint). Owns all secrets and all calls to TMDB.
- `apps/mobile` — Expo SDK 57 + Expo Router (routes in `src/app/`). Read `apps/mobile/AGENTS.md`.
- `packages/shared` — the API contract: zod schemas + inferred types. Built to `dist/`
  (`pnpm --filter @reelmark/shared build`) before api/mobile can use it.

## Commands (run from repo root)

- `pnpm dev:api` / `pnpm dev:mobile` — dev servers
- `pnpm check` — format check + lint + typecheck + unit + e2e for everything (same as CI)
- `pnpm format` — Prettier for the whole repo (config in `.prettierrc`)
- `pnpm --filter @reelmark/api <script>` — run a script in one package
- `pnpm security:secrets` — gitleaks scan of the working tree

## Security rules — non-negotiable

1. **Secrets live only in `apps/api/.env`** (git-ignored). Never read, print, copy or edit
   `.env` files — agent permissions deny it, and `.claude/hooks/guard-env.mjs` blocks any
   shell command that mentions one or searches recursively without excluding them (use
   `grep -r --exclude='.env*'` or `rg`, which skips git-ignored files). Use `.env.example` to learn variable names.
   To run the API with a fake value, pass it inline (min 32 chars, `[A-Za-z0-9._-]` only):
   `TMDB_ACCESS_TOKEN=test-dummy-token-0123456789abcdef PORT=3999 node dist/main.js`.
2. **The mobile app holds no secrets.** Everything in the app bundle (incl. `EXPO_PUBLIC_*`)
   is public. The app talks only to our API, never to TMDB directly.
3. **Never forward raw third-party data or build generic proxies.** Each API endpoint maps to
   a fixed upstream call with validated params, and upstream responses are parsed with zod
   and mapped to our own types from `packages/shared`.
4. **Validate all input** with the zod schemas from `packages/shared`.
5. **No new dependencies without approval.** pnpm blocks install scripts, too-fresh releases
   and trust downgrades (see `pnpm-workspace.yaml`); don't weaken these settings.
6. **Errors never leak internals**: no stack traces, upstream bodies, headers or tokens in
   responses or logs.
7. The pre-commit hook (`.githooks/pre-commit`) blocks `.env` files and runs gitleaks — never
   bypass it with `--no-verify`.

## Conventions

- Docs: `docs/ARCHITECTURE.md` (keep in sync with code), `docs/BACKLOG.md` (deferred work;
  reference items from code as `TODO(phase-1): …`).
- Comments explain intent and non-obvious constraints — never the history of how code was written.
- Contract-first: change `packages/shared` first, then api + mobile.
- TypeScript strict everywhere; no `any` in new code.
- UI copy is Ukrainian; code, comments and commit messages are English.
- TMDB attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB.")
  must stay visible in the app.
