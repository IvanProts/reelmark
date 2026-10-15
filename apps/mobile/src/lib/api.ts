/** Our API's endpoints. Inputs go through the shared contract before they are sent. */
import {
  DeckQuerySchema,
  DeckResponseSchema,
  LibraryPageSchema,
  LibraryQuerySchema,
  MeSchema,
  MovieDetailsQuerySchema,
  MovieDetailsSchema,
  MovieIdParamsSchema,
  SaveDecisionSchema,
  UpdateMeSchema,
  type DeckResponse,
  type LibraryPage,
  type LibraryStatus,
  type Locale,
  type Me,
  type MovieDetails,
  type Region,
  type SaveDecision,
} from '@reelmark/shared';

import { authorizedRequest } from './session';

/** One page of undecided movies, localised to `lang`. */
export function fetchDeck(page: number, lang: Locale, signal?: AbortSignal): Promise<DeckResponse> {
  const query = DeckQuerySchema.parse({ page, lang });
  return authorizedRequest(`/movies/deck?page=${query.page}&lang=${query.lang}`, {
    schema: DeckResponseSchema,
    signal,
  });
}

/** Everything the movie sheet shows, localised to `lang`, with ratings and offers for `region`. */
export function fetchMovieDetails(
  movieId: number,
  lang: Locale,
  region: Region,
  signal?: AbortSignal,
): Promise<MovieDetails> {
  const params = MovieIdParamsSchema.parse({ movieId });
  const query = MovieDetailsQuerySchema.parse({ lang, region });
  return authorizedRequest(
    `/movies/${params.movieId}/details?lang=${query.lang}&region=${query.region}`,
    { schema: MovieDetailsSchema, signal },
  );
}

/** Saves (or replaces) the user's decision about a movie. */
export function saveDecision(movieId: number, decision: SaveDecision): Promise<void> {
  const params = MovieIdParamsSchema.parse({ movieId });
  return authorizedRequest(`/me/decisions/${params.movieId}`, {
    method: 'PUT',
    body: SaveDecisionSchema.parse(decision),
  });
}

/** Forgets the decision, so the movie can appear in the deck again. */
export function deleteDecision(movieId: number): Promise<void> {
  const params = MovieIdParamsSchema.parse({ movieId });
  return authorizedRequest(`/me/decisions/${params.movieId}`, { method: 'DELETE' });
}

/** One page of the library, newest decisions first. */
export function fetchLibrary(
  status: LibraryStatus,
  lang: Locale,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<LibraryPage> {
  const query = LibraryQuerySchema.parse({ status, lang, cursor });
  const cursorParam = query.cursor ? `&cursor=${query.cursor}` : '';
  return authorizedRequest(
    `/me/library?status=${query.status}&lang=${query.lang}&limit=${query.limit}${cursorParam}`,
    { schema: LibraryPageSchema, signal },
  );
}

export function fetchMe(signal?: AbortSignal): Promise<Me> {
  return authorizedRequest('/me', { schema: MeSchema, signal });
}

/** Saves the language choice to the account. */
export function updateMe(locale: Locale): Promise<Me> {
  return authorizedRequest('/me', {
    method: 'PATCH',
    body: UpdateMeSchema.parse({ locale }),
    schema: MeSchema,
  });
}

/** Deletes the account and all its data on the server. */
export function deleteMe(): Promise<void> {
  return authorizedRequest('/me', { method: 'DELETE' });
}
