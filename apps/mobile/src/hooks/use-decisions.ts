/** Mutations that save or undo a decision, shared by the deck and the library. */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DecisionStatus } from '@reelmark/shared';

import { deleteDecision, saveDecision } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

type SaveVariables = { movieId: number; status: DecisionStatus; liked?: boolean | null };

// Every decision mutation shares one scope, so they reach the server in the order they were
// made: an undo can never overtake the save it reverts.
const DECISIONS_SCOPE = { id: 'decisions' };

export function useSaveDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movieId, status, liked = null }: SaveVariables) =>
      saveDecision(movieId, { status, liked }),
    scope: DECISIONS_SCOPE,
    // Library screens refetch when they are next shown (they unsubscribe while hidden).
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll }),
  });
}

export function useDeleteDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movieId: number) => deleteDecision(movieId),
    scope: DECISIONS_SCOPE,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll }),
  });
}
