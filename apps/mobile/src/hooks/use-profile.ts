/** The signed-in (anonymous) user's profile: saved language and account deletion. */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { Locale } from '@reelmark/shared';

import { deleteMe, fetchMe, updateMe } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { endSession } from '@/lib/session';

/** `GET /me`. The first call also creates the anonymous session when there is none. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: Infinity,
  });
}

/** Saves the language choice to the account (`PATCH /me`). */
export function useSaveLocale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locale: Locale) => updateMe(locale),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
  });
}

/** Deletes the account on the server, then forgets everything this device knew about it. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMe,
    onSuccess: async () => {
      await endSession();
      await resetUserData(queryClient);
    },
  });
}

/**
 * Drops every cached query and pending mutation of the previous account, then loads the
 * profile again, which starts a new anonymous session.
 */
export async function resetUserData(queryClient: QueryClient): Promise<void> {
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
  await queryClient.resetQueries({ queryKey: queryKeys.me });
}
