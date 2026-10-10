# Roadmap

Reelmark is a learning and showcase project. Its scope ends with a polished, demo-ready app.

| Phase | Theme                     | Outcome for the user                                          | Status  |
| ----- | ------------------------- | ------------------------------------------------------------- | ------- |
| 0     | Foundation                | Browse a deck of popular movies in Ukrainian or English       | Done    |
| 1     | Swipes, accounts, library | Swipe to sort movies; decisions are saved; a personal library | Done    |
| 1.5   | Decide faster             | Trailer, critics' scores and key facts on every card          | Next    |
| 2     | Showcase polish           | A native build on a real phone and a demo anyone can watch    | Planned |

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

## Phase 2 — Showcase polish

- A native development build installed on a real iPhone (no Expo Go), for live demos.
- A short demo video and GIFs in the README.
- A guide for reviewers: the key decisions, the security model and how the tests are organised.
