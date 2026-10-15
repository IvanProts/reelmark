/** The movie sheet's data: details, scores and where to watch, for any movie id. */
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '@/i18n';
import { fetchMovieDetails } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { getDeviceRegion } from '@/lib/region';

import { useMe } from './use-profile';

/** The API caches details for a day; reopening a sheet within this window costs no request. */
const DETAILS_STALE_MS = 30 * 60 * 1000;

export function useMovieDetails(movieId: number | undefined) {
  const { locale } = useI18n();
  const me = useMe();
  const region = getDeviceRegion();

  return useQuery({
    queryKey: queryKeys.movieDetails(movieId, locale, region),
    queryFn: ({ signal }) => {
      // `enabled` below guarantees an id; the check narrows the type.
      if (movieId === undefined) throw new Error('movieId is required');
      return fetchMovieDetails(movieId, locale, region, signal);
    },
    // Wait for the profile, so a cold-start deep link asks in the saved language.
    enabled: movieId !== undefined && !me.isPending,
    staleTime: DETAILS_STALE_MS,
  });
}
