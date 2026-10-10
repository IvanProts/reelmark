import { QueryClient } from '@tanstack/react-query';

import type { LibraryStatus, Locale } from '@reelmark/shared';

import { ApiError } from './http';

/** Whether retrying might help: network problems and 5xx, not bad data or configuration. */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.kind === 'unreachable' || (error.kind === 'server' && (error.status ?? 0) >= 500);
}

/**
 * The app's server-data cache. A module-level singleton is fine here: a mobile app has one
 * user and no server-side rendering, so there is nothing to isolate per request.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => isTransientError(error) && failureCount < 1,
    },
    mutations: {
      retry: (failureCount, error) => isTransientError(error) && failureCount < 2,
    },
  },
});

/** Query keys in one place, so invalidation can't miss a spelling. Data is per user. */
export const queryKeys = {
  me: ['me'] as const,
  deck: (userId: string | undefined, locale: Locale) => ['deck', userId, locale] as const,
  libraryAll: ['library'] as const,
  library: (userId: string | undefined, status: LibraryStatus, locale: Locale) =>
    ['library', userId, status, locale] as const,
};
