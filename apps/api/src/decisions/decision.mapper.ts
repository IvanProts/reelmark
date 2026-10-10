import type { Decision, DecisionStatus } from '@reelmark/shared';

import type { Decision as DecisionRow } from '../generated/prisma/client.js';
import { DecisionStatus as DbDecisionStatus } from '../generated/prisma/enums.js';

/** Contract status → database enum. */
export const DB_DECISION_STATUS: Record<DecisionStatus, DbDecisionStatus> = {
  seen: DbDecisionStatus.SEEN,
  not_seen: DbDecisionStatus.NOT_SEEN,
  want: DbDecisionStatus.WANT,
};

const API_DECISION_STATUS: Record<DbDecisionStatus, DecisionStatus> = {
  SEEN: 'seen',
  NOT_SEEN: 'not_seen',
  WANT: 'want',
};

/** A stored decision in the shape of the shared `DecisionSchema`. */
export function toDecision(row: DecisionRow): Decision {
  return {
    movieId: row.movieId,
    status: API_DECISION_STATUS[row.status],
    liked: row.liked,
    updatedAt: row.updatedAt.toISOString(),
  };
}
