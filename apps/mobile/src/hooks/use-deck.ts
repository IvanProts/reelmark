/** Data and position for the swipe deck on the deck screen. */
import { useEffect, useState } from 'react';

import { Image } from 'expo-image';

import { useInfiniteQuery } from '@tanstack/react-query';

import { MAX_DECK_PAGE, type MovieCard } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { fetchDeck } from '@/lib/api';

/** Start loading the next page when this many cards (or fewer) are left. */
const PREFETCH_WHEN_REMAINING = 5;
/** Posters to download ahead, beyond the two cards already on screen. */
const POSTERS_TO_PREFETCH = 3;

/**
 * - `loading`: the first page, a retry, or the next page after running out
 * - `ready`: there is a card to show
 * - `error`: out of cards and the request for more failed
 * - `empty`: the API returned no movies at all
 * - `finished`: every page has been seen
 */
type DeckStatus = 'loading' | 'ready' | 'error' | 'empty' | 'finished';

/**
 * Movies from the API, page by page, in the current UI language, plus the index of the
 * top card. Loads the next page and the upcoming posters before the user needs them.
 */
export function useDeck() {
  const { locale } = useI18n();
  // Index of the top card. It survives a language switch, but the decks for different
  // languages are ordered slightly differently, so the movie at that index can change.
  // TODO(phase-1): remember the current movie id instead of its index.
  const [position, setPosition] = useState(0);

  const query = useInfiniteQuery({
    // Each language is cached separately; switching loads (or reuses) that deck.
    queryKey: ['deck', locale],
    queryFn: ({ pageParam, signal }) => fetchDeck(pageParam, locale, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const lastAvailable = Math.min(lastPage.totalPages, MAX_DECK_PAGE);
      return lastPage.page < lastAvailable ? lastPage.page + 1 : undefined;
    },
    // Never refetch in the background: the deck must not reshuffle under the user's finger.
    staleTime: Infinity,
  });

  // Rankings shift between page requests, so a movie can appear twice; keep the first.
  const cards = uniqueById(query.data?.pages.flatMap((page) => page.items) ?? []);
  const current = cards[position];
  const next = cards[position + 1];
  const remaining = cards.length - position;

  const { hasNextPage, isFetching, isError, fetchNextPage } = query;

  useEffect(() => {
    if (remaining <= PREFETCH_WHEN_REMAINING && hasNextPage && !isFetching && !isError) {
      void fetchNextPage();
    }
  }, [remaining, hasNextPage, isFetching, isError, fetchNextPage]);

  // Joined into one string so the effect re-runs only when the URLs actually change.
  const upcomingPosters = cards
    .slice(position + 2, position + 2 + POSTERS_TO_PREFETCH)
    .map((card) => card.posterUrl)
    .join(' ');
  useEffect(() => {
    if (upcomingPosters) void Image.prefetch(upcomingPosters.split(' '));
  }, [upcomingPosters]);

  const status = getDeckStatus({
    hasCard: current !== undefined,
    isLoading: query.isPending || isFetching,
    isError,
    hasNextPage,
    cardCount: cards.length,
  });

  return {
    status,
    /** The card on top of the stack. */
    current,
    /** The card peeking out from behind it. */
    next,
    /** Number of cards rated in this session. */
    position,
    error: query.error,
    advance: () => setPosition((value) => value + 1),
    /** Back to the first card, offered once the deck is finished. */
    restart: () => setPosition(0),
    /** Loads the missing next page, or reloads the deck from scratch. */
    retry: () => {
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
  cardCount: number;
}): DeckStatus {
  if (deck.hasCard) return 'ready';
  if (deck.isLoading) return 'loading';
  if (deck.isError) return 'error';
  // Out of cards with more pages available: the prefetch effect is loading them.
  if (deck.hasNextPage) return 'loading';
  return deck.cardCount === 0 ? 'empty' : 'finished';
}

function uniqueById(cards: MovieCard[]): MovieCard[] {
  const seen = new Set<number>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}
