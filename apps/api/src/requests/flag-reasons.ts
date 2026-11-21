import type { Prisma, RequestStatus } from '@prisma/client';

// The first source of flag reasons (Sprint 2 spec §3.2). A new source is a
// new identifier here; nothing that reads flag reasons depends on which one.
export const FLAG_SOURCE_PROVIDER_OBJECTION = 'PROVIDER_OBJECTION';

export const DECIDED: RequestStatus[] = ['APPROVED', 'REJECTED'];

// Statuses in which a request is never flagged: decided, or under automated
// review, so no officer can decide a request mid-run even if it already
// carries an objection (Sprint 3 spec §3.1).
const NEVER_FLAGGED: RequestStatus[] = [...DECIDED, 'UNDER_AUTOMATED_REVIEW'];

// Flagged means at least one reason, no decision yet and no pipeline run in
// progress (§3.1). It is worked out rather than stored, so the status the
// requester sees cannot show it.
export function isFlagged(status: RequestStatus, reasonCount: number): boolean {
  return reasonCount > 0 && !NEVER_FLAGGED.includes(status);
}

// The same rule as a query filter.
export const FLAGGED: Prisma.DataSharingRequestWhereInput = {
  status: { notIn: NEVER_FLAGGED },
  flagReasons: { some: {} },
};
