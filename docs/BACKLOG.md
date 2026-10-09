# Backlog

Known follow-ups, deliberately deferred. Code that depends on an item references it with
`TODO(phase-1)`.

## Phase 1 — swipe gestures, accounts, persistence

- **Swipe gestures** on the card stack (pan + fling), replacing the "Seen / Not seen" buttons as the
  primary input.
- **Persist decisions** (seen / not seen / want to watch) per user in PostgreSQL.
- **Keep the deck position stable across a language switch.** The `uk` and `en` decks are ordered
  slightly differently by TMDB, so the app must track the current movie by id, not by index.
- **Persist the language choice** (currently in memory only).
- **Cache failed English overview fallbacks** for ~60 s (like genre failures), or give the fallback
  a short time budget, so a hanging upstream endpoint can't slow down every `uk` deck request.
- **Mark the language of fallback overviews** in the contract (e.g. `overviewLang`) so screen
  readers pronounce English text with an English voice.
- **Per-user rate limiting** plus a global budget, once accounts exist.
- **Route parameters**: validate ids with shared zod schemas; build upstream URLs with `new URL()`.
- **JSON-only API**: disable form-urlencoded parsing, cap request bodies at ~16 KB, send
  `Cache-Control: no-store` on user data.

## Security & infrastructure

- **Sandboxed shell for AI tooling.** `.claude/hooks/guard-env.mjs` blocks commands that could read
  `.env` files by pattern; OS-level sandboxing would enforce it regardless of how a command is
  written. Requires an allow-list of network domains (npm, Expo, TMDB).
- **`trust proxy`** set to the exact hop count when deployed behind a proxy.
- **Expo SDK 58**: remove the Expo entries from `trustPolicyExclude` (SDK 58 ships with provenance)
  and re-check the accepted advisories in `auditConfig`.
- **`decode-uri-component`** (moderate, ships in the app via expo-router deep-link parsing): track
  the Expo fix.
- Consider a 3–7 day `minimumReleaseAge` for production dependencies.

## Before store release

- **Name clearance for "Reelmark"**: trademark search (USPTO, EUIPO, Ukrainian IP office), App Store
  / Google Play name availability, domain and social handles.

## Polish

- TMDB logo on the About screen (TMDB attribution guidelines).
- Android dev/release builds need HTTPS or a cleartext exception for a local API.
- Drop `vite-tsconfig-paths` from the API test setup (Vite 8 resolves tsconfig paths natively).
- Evaluate Nest 12's built-in `app.useSecurityHeaders()` as a replacement for `helmet`.
