# Phase 1.5 design — decide faster

Status: **accepted**. Roadmap: [../ROADMAP.md](../ROADMAP.md).

## Goals

- Everything people use to decide between "want" and "not interested", one tap away from any card:
  trailer, critics' scores, key facts and where to watch.
- The trailer plays inside the app.
- Details work for any movie id, so deep links and the library no longer depend on data already on
  screen.

**Non-goals:** AI summaries of reviews, recommendations, a vertical trailer feed.

## User experience

Tapping a deck card (or its "Details" button) or a library poster opens the **movie sheet**:

1. **Header:** poster, title, year · runtime · age rating.
2. **▶ Trailer:** opens a full-screen player. Hidden when the movie has no trailer.
3. **Ratings row,** text only, each labelled with its source: "TMDB audience 7.5", "Rotten
   Tomatoes 93%", "Metacritic 81". A score is left out when it is unknown.
4. Tagline, overview, director(s), top cast.
5. **Where to watch** in the device's country: streaming, rent and buy rows of provider logos,
   credited "Data: JustWatch", and a link to TMDB's where-to-watch page (opens in the browser).
   When there are no offers, a short "Not available to stream in your country" note.
6. **Decision controls:**
   - from the deck: Seen / Not seen / Want, which sort the top card and close the sheet;
   - from the library: change or remove the decision, as today.

## API

`GET /api/v1/movies/:movieId/details?lang=uk&region=UA` → `MovieDetails`
([contract](../../packages/shared/src/details.ts)).

- Authenticated, with the default per-user rate limit.
- `movieId` is validated with `MovieIdParamsSchema`, the query with `MovieDetailsQuerySchema`.

**TMDB, one call per language:**

- `GET /movie/{id}?language=<tag>&append_to_response=videos,credits,release_dates,watch/providers&include_video_language=<lang>,en`.
- Field selection:
  - **Trailer:** official YouTube trailers first, in the requested language, then in English.
  - **Certification:** the region's, falling back to the US.
  - **Watch options:** the region's entry in `watch/providers`.
- A blank overview falls back to the English version of the same call, cached like any other.
- TMDB 404 → our generic 404.
- The movie is upserted into the catalog, so a decision can follow even for a movie that was never
  in a deck.

**Wikidata, critics' scores:**

- A fixed SPARQL query (`wdt:P4947` = TMDB movie id, `p:P444` review scores, `pq:P447` = Rotten
  Tomatoes `Q105584` or Metacritic `Q150248`). The only variable is the validated integer id.
- Sent as GET to `https://query.wikidata.org/sparql` with a descriptive `User-Agent`, as Wikimedia's
  policy requires.
- The latest statement wins (`pq:P585`). "93%" → 93 and "81/100" → 81; other formats (e.g. the
  "9/10" average rating) are ignored.
- Best effort: a failure or timeout gives null scores and never fails the request.

**Caching (in process):**

- details per `(movieId, lang, region)`: 24 h;
- Wikidata scores per movie: 7 days;
- Wikidata failures: 10 minutes.

**Security:**

- the same rules as the deck: fixed upstream URLs built with `new URL()`, `redirect: 'manual'`,
  timeouts, size caps, zod parsing, our own types only;
- logos and posters only from `image.tmdb.org`, links only to `www.themoviedb.org`;
- the YouTube id must match `^[A-Za-z0-9_-]{11}$`;
- new upstream base URLs are env-configurable for tests only (https unless `NODE_ENV=test` and
  localhost), like `TMDB_BASE_URL`.

## Mobile

- **Region:** the device's region from `expo-localization`, validated with `RegionSchema`, falling back
  to `DEFAULT_REGION`.
- **Trailer player:** `react-native-webview`, installed with `npx expo install`; the owner approved the
  dependency.
  - **Source:** `https://www.youtube-nocookie.com/embed/<id>?playsinline=1&rel=0`, built in the app
    from the validated id.
  - **Navigation:**
    - `onShouldStartLoadWithRequest` allows only `www.youtube-nocookie.com/embed/…`;
    - a tap on a YouTube link inside the player opens the YouTube app or browser instead (only
      `youtube.com` / `youtu.be` hosts);
    - everything else is blocked.
  - **Isolation:**
    - no `onMessage` bridge, no injected JavaScript, no multiple windows;
    - `allowsInlineMediaPlayback`;
    - YouTube's embed requirements for mobile WebViews (e.g. an HTTP Referer) are verified on the
      simulator.
- **Screen readers:**
  - each score is announced with its source;
  - provider logos have the provider name as their label;
  - the player has a labelled close button.

## Testing

- **API unit tests:**
  - trailer selection;
  - certification fallback;
  - Wikidata value parsing ("93%", "81/100", junk, several dates);
  - the details mapper.
- **API e2e tests** with fake TMDB and Wikidata servers:
  - the contract;
  - invalid ids and regions;
  - TMDB 404;
  - Wikidata down or slow (still 200);
  - caching;
  - the catalog upsert;
  - no secrets in logs.
- **Mobile:** typecheck, lint and a simulator run-through with screenshots, including the trailer
  playing.
