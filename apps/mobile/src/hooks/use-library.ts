/** The user's library lists (seen / want to watch), loaded page by page. */
import { useIsFocused } from 'expo-router';

import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import type { LibraryItem, LibraryPage, LibraryStatus } from '@reelmark/shared';

import { useI18n } from '@/i18n';
import { fetchLibrary } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

import { useMe } from './use-profile';

export function useLibrary(status: LibraryStatus) {
  const { locale } = useI18n();
  const me = useMe();
  // Hidden screens stop listening, so swiping in the deck doesn't refetch the library in
  // the background; on return, stale data is refetched once.
  const isFocused = useIsFocused();

  const query = useInfiniteQuery({
    queryKey: queryKeys.library(me.data?.id, status, locale),
    queryFn: ({ pageParam, signal }) => fetchLibrary(status, locale, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: me.isSuccess,
    subscribed: isFocused,
  });

  return {
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    query,
  };
}

/** A library item from whatever library pages are already cached (for the detail sheet). */
export function useCachedLibraryItem(movieId: number | undefined): LibraryItem | undefined {
  const queryClient = useQueryClient();
  if (movieId === undefined) return undefined;
  const cached = queryClient.getQueriesData<InfiniteData<LibraryPage>>({
    queryKey: queryKeys.libraryAll,
  });
  for (const [, data] of cached) {
    for (const page of data?.pages ?? []) {
      const item = page.items.find((candidate) => candidate.movie.id === movieId);
      if (item) return item;
    }
  }
  return undefined;
}
