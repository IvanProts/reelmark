# @reelmark/shared

The API contract between `@reelmark/api` and `@reelmark/mobile`: [zod](https://zod.dev) schemas plus
the TypeScript types inferred from them.

- The **API** validates incoming requests with these schemas (via NestJS Standard Schema support).
- The **app** validates API responses with them before using any data.
- Changing a schema here breaks the build on whichever side hasn't been updated — by design.

| Export                                                | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| `SUPPORTED_LOCALES`, `LocaleSchema`, `DEFAULT_LOCALE` | Languages supported by UI and movie data |
| `DeckQuerySchema`                                     | Query of `GET /api/v1/movies/deck`       |
| `DeckResponseSchema`, `MovieCardSchema`               | Deck response and a single swipe card    |
| `ApiError`                                            | Error body of every non-2xx response     |

```sh
pnpm --filter @reelmark/shared build   # compiles to dist/ (required before api/mobile run)
```
