# Roadmap

| Phase | Theme                         | Outcome for the user                                                  | Status  |
| ----- | ----------------------------- | --------------------------------------------------------------------- | ------- |
| 0     | Foundation                    | Browse a deck of popular movies in Ukrainian or English               | Done    |
| 1     | Swipes, accounts, library     | Swipe to sort movies; decisions are saved; a personal library         | Done    |
| 1.5   | Decide faster                 | Trailer, critics' scores and key facts on every card                  | Next    |
| 2     | Recommendations               | "What to watch next", filterable by genre, with explanations          | Planned |
| 3     | Notifications                 | Watchlist titles becoming available, relevant releases, a weekly pick | Planned |
| 4     | Collaborative recommendations | "People with similar taste also loved…"                               | Planned |

## Phase 1 — Swipes, accounts, library

Design: [design/phase-1.md](design/phase-1.md).

- Swipe gestures: right = seen, left = not seen, up = want to watch; "liked?" follow-up for seen
  movies; undo.
- Anonymous accounts created on first launch (no sign-up wall), with secure token storage.
- Decisions persisted in PostgreSQL; the deck excludes movies the user has already sorted.
- Library screen: seen / want to watch, in the user's language.
- Account deletion (required by the App Store for apps with accounts).

## Phase 1.5 — Decide faster

A poster, a rating and an overview are often not enough to decide between "want" and "not
interested". The card gains what people actually use to decide:

- **Trailer** — a "▶ Trailer" button on the card: the Ukrainian trailer when TMDB has one, the
  English one otherwise. Played in the app with YouTube's official embedded player in a
  `react-native-webview`, locked to `youtube-nocookie.com` (no other navigation allowed).
- **Critics' scores** — Rotten Tomatoes and Metacritic, labelled with their source, from Wikidata
  (CC0, so usable in a commercial app), matched by TMDB id. Neither site offers a public API and
  their terms forbid scraping, so Wikidata is the only source; text only, no third-party logos.
- **Audience rating** — the existing TMDB score, labelled as the audience's to keep it apart from
  the critics'.
- **Key facts** — runtime, director, top cast, tagline, age rating.
- **Where to watch** — streaming services in the user's country (TMDB watch providers, data by
  JustWatch, which must be credited). Coverage for Ukraine needs checking first.

All of it comes through new fixed API endpoints with validated ids, parsed with zod and cached in
the catalog, like the deck.

## Phase 2 — Recommendations

**Taste profile (content-based).** Every decision is a signal: seen + liked, seen + disliked, not
seen, want to watch. Movie features from TMDB — genres, keywords (e.g. _slasher_, _slow burn_,
_found footage_), director, cast, decade, country, rating — are aggregated into a per-user taste
profile: features of liked movies weigh positively, disliked ones negatively.

**Genre is a filter, taste is the ranking.** Choosing "Thriller" restricts the candidate pool to
thrillers, but candidates are ranked by the taste profile learned from _all_ decisions. Someone who
loves slow-burn psychological horror gets psychological thrillers first, not action thrillers,
because the profile's features (psychological, slow burn, family drama) transfer across genres.

**Ranking.** Similarity to the profile, blended with quality (rating) and freshness, plus:

- diversity — no runs of sequels from one franchise;
- exploration — a small share of deliberately different picks to keep learning;
- explanations — "Because you liked _Hereditary_ and _The Witch_".

**Critics' consensus.** A short summary in the user's language of what critics praise and
criticise ("Critics praise the atmosphere and the acting but find the ending drawn out"),
generated once per movie by Claude from the film's Wikipedia "Critical response" section, credited
and linked to the source, and stored in the catalog. It shares the server-side AI setup with the
explanations; the Anthropic API key lives only in the API's env, like the TMDB token.

**Collections.** Themed decks to swipe through, like the lists people follow on social media:
"Slashers of the 80s", "Psychological thrillers with a twist", "Under 90 minutes". Most are built
from TMDB keywords, a few are hand-picked; the taste profile ranks movies within each collection.

**Implementation.** Candidates from TMDB discover and per-movie recommendations; features stored in
PostgreSQL; later, text embeddings of overviews and keywords in `pgvector` to capture "mood"
similarity beyond genre labels.

## Phase 3 — Notifications

Push notifications are the most effective retention tool and the easiest to lose: once a user
disables them, they rarely come back. Principles: ask for permission only after the user has seen
value (e.g. after 30 swipes), let them choose frequency and time, respect quiet hours, and send one
strong pick rather than a list.

In order of value:

1. **Watchlist availability** — a "want to watch" title arrives on a streaming service in the user's
   country, or in cinemas (TMDB release dates and watch providers).
2. **Relevant releases** — new movies matching the taste profile or from favourite directors.
3. **Weekly movie-night pick** — one personalised recommendation, e.g. Friday evening.

Infrastructure: Expo push notifications (APNs/FCM), a scheduler and job queue on the API, per-device
push tokens, per-user preferences and unsubscribe.

## Phase 4 — Collaborative recommendations

Once there are enough users, add item-to-item collaborative filtering ("people with similar taste
also loved…") and blend it with the content-based ranking from Phase 2.
