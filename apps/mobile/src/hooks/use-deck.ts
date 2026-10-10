/** State of the swipe deck: undecided movies, the decisions made this session and undo. */
import { useEffect, useState } from 'react';

import { Image } from 'expo-image';

import { useInfiniteQuery } from '@tanstack/react-query';

import { MAX_DECK_PAGE, type DecisionStatus, type MovieCard } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { fetchDeck } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

import { useDeleteDecision, useSaveDecision } from './use-decisions';
import { useMe } from './use-profile';

/** Start loading the next page when this many cards (or fewer) are left. */
const PREFETCH_WHEN_REMAINING = 5;
/** Posters to download ahead, beyond the two cards already on screen. */
const POSTERS_TO_PREFETCH = 3;
/** How long a failure notice stays before it hides itself. */
const FAILURE_VISIBLE_MS = 5000;

/**
 * - `loading`: the session, the first page, a retry, or the next page after running out
 * - `ready`: there is a card to show
 * - `error`: out of cards and the request for more failed
 * - `empty`: the API returned no movies at all
 * - `finished`: every loaded movie has been sorted and there are no more pages
 */
type DeckStatus = 'loading' | 'ready' | 'error' | 'empty' | 'finished';

export type DeckEntry = { movie: MovieCard; status: DecisionStatus };

/** A save or undo that failed after its retries; the deck has already been put back. */
export type DeckFailure = { kind: 'save' | 'rate' | 'undo'; title: string };

/**
 * Movies from the API, page by page, in the current UI language. Decisions are optimistic:
 * a decided card leaves the deck at once, and comes back if saving fails.
 */
export function useDeck() {
  const { locale } = useI18n();
  const me = useMe();
  const saveDecision = useSaveDecision();
  const deleteDecision = useDeleteDecision();
  /** Decisions made in this session, oldest first: hides decided cards and powers undo. */
  const [history, setHistory] = useState<DeckEntry[]>([]);
  const [failure, setFailure] = useState<DeckFailure | null>(null);

  useEffect(() => {
    if (!failure) return;
    const timer = setTimeout(() => setFailure(null), FAILURE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [failure]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.deck(me.data?.id, locale),
    queryFn: ({ pageParam, signal }) => fetchDeck(pageParam, locale, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const lastAvailable = Math.min(lastPage.totalPages, MAX_DECK_PAGE);
      return lastPage.page < lastAvailable ? lastPage.page + 1 : undefined;
    },
    // Wait for the profile, so the first page is requested in the saved language.
    enabled: !me.isPending,
    // Never refetch in the background: the deck must not reshuffle under the user's finger.
    staleTime: Infinity,
  });

  // Rankings shift between page requests, so a movie can appear twice; keep the first.
  const loaded = uniqueById(query.data?.pages.flatMap((page) => page.items) ?? []);
  const decidedIds = new Set(history.map((entry) => entry.movie.id));
  const cards = loaded.filter((card) => !decidedIds.has(card.id));
  const current = cards[0];
  const next = cards[1];

  const { hasNextPage, isFetching, isError, fetchNextPage } = query;

  useEffect(() => {
    if (cards.length <= PREFETCH_WHEN_REMAINING && hasNextPage && !isFetching && !isError) {
      void fetchNextPage();
    }
  }, [cards.length, hasNextPage, isFetching, isError, fetchNextPage]);

  // Joined into one string so the effect re-runs only when the URLs actually change.
  const upcomingPosters = cards
    .slice(2, 2 + POSTERS_TO_PREFETCH)
    .map((card) => card.posterUrl)
    .join(' ');
  useEffect(() => {
    if (upcomingPosters) void Image.prefetch(upcomingPosters.split(' '));
  }, [upcomingPosters]);

  function decide(movie: MovieCard, status: DecisionStatus) {
    setFailure(null);
    setHistory((entries) => [...entries, { movie, status }]);
    saveDecision.mutate(
      { movieId: movie.id, status },
      {
        onError: () => {
          setHistory((entries) => entries.filter((entry) => entry.movie.id !== movie.id));
          setFailure({ kind: 'save', title: movie.title });
        },
      },
    );
  }

  /** Adds 👍 / 👎 to a movie already saved as seen. */
  function rate(movie: MovieCard, liked: boolean) {
    saveDecision.mutate(
      { movieId: movie.id, status: 'seen', liked },
      { onError: () => setFailure({ kind: 'rate', title: movie.title }) },
    );
  }

  /** Brings back the last decided card and deletes its saved decision. */
  function undo(): DeckEntry | undefined {
    const last = history.at(-1);
    if (!last) return undefined;
    setFailure(null);
    setHistory((entries) => entries.slice(0, -1));
    deleteDecision.mutate(last.movie.id, {
      onError: () => {
        setHistory((entries) => [...entries, last]);
        setFailure({ kind: 'undo', title: last.movie.title });
      },
    });
    return last;
  }

  const status = getDeckStatus({
    hasCard: current !== undefined,
    isLoading: me.isPending || query.isPending || isFetching,
    isError: isError || me.isError,
    hasNextPage,
    loadedCount: loaded.length,
  });

  return {
    status,
    /** The card on top of the stack. */
    current,
    /** The card peeking out from behind it. */
    next,
    /** Number of cards sorted in this session. */
    sortedCount: history.length,
    canUndo: history.length > 0,
    error: query.error ?? me.error,
    failure,
    dismissFailure: () => setFailure(null),
    decide,
    rate,
    undo,
    /** Loads the missing next page, or reloads the deck (and profile) from scratch. */
    retry: () => {
      if (me.isError) void me.refetch();
      if (query.data && hasNextPage) void fetchNextPage();
      else void query.refetch();
    },
  };
}

function getDeckStatus(deck: {
  hasCard: boolean;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  loadedCount: number;
}): DeckStatus {
  if (deck.hasCard) return 'ready';
  if (deck.isLoading) return 'loading';
  if (deck.isError) return 'error';
  // Out of cards with more pages available: the prefetch effect is loading them.
  if (deck.hasNextPage) return 'loading';
  return deck.loadedCount === 0 ? 'empty' : 'finished';
}

function uniqueById(cards: MovieCard[]): MovieCard[] {
  const seen = new Set<number>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}
