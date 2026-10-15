# Backlog

Known follow-ups, deliberately deferred. Code that depends on an item references it with
`TODO(backlog): …`.

## Deck & content

- **Cache failed English overview fallbacks** for ~60 s (like genre failures), or give the fallback
  a short time budget, so a hanging upstream endpoint can't slow down every `uk` deck request.
- **Mark the language of fallback overviews** in the contract (e.g. `overviewLang`) so screen
  readers pronounce English text with an English voice.
- **A global TMDB budget** on top of the per-user rate limits, so many accounts together can't
  exhaust our TMDB quota.
- **Upstream URLs for per-movie endpoints** (details, videos, watch providers) built with `new URL()` from
  validated ids.

## Accounts

- **Sign in with Apple / Google**, attached to the existing anonymous account, so a library
  survives a new phone or a reinstall.
- **Device attestation for anonymous sign-up** (App Attest / Play Integrity) before public launch.
  The per-IP limit (10 per hour) can block real users behind carrier NAT, where many phones share
  one address; and since rate limits are per user, each new anonymous account starts with fresh
  ones.
- **Clean-up job**: delete expired and revoked refresh tokens (today each refresh only removes that
  user's expired ones) and long-inactive anonymous accounts that have no decisions.

## Performance

- **Bulk catalog writes**: one `INSERT … ON CONFLICT` per served deck page instead of ~2 upserts per
  movie.

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

- **"Liked it?" prompt and failure toast are not drawn** on the current iOS simulator, although
  they are laid out and announced (`src/components/deck-toast.tsx`, Reanimated `entering`). They
  rendered on 2026-10-09; the Phase 1 code alone shows the same behaviour now, so suspect the
  simulator/runtime. Check on a device first.
- **Android check** of the trailer player (fullscreen video), the movie sheet and the deck.
- **TMDB logo** on the About screen: TMDB's terms require the logo, not only the text notice.
- Android dev/release builds need HTTPS or a cleartext exception for a local API.
- Drop `vite-tsconfig-paths` from the API test setup (Vite 8 resolves tsconfig paths natively).
- Evaluate Nest 12's built-in `app.useSecurityHeaders()` as a replacement for `helmet`.
