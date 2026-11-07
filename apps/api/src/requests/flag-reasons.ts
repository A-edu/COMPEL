import type { RequestStatus } from '@prisma/client';

// The first source of flag reasons (Sprint 2 spec §3.2). A new source is a
// new identifier here; nothing that reads flag reasons depends on which one.
export const FLAG_SOURCE_PROVIDER_OBJECTION = 'PROVIDER_OBJECTION';

export const DECIDED: RequestStatus[] = ['APPROVED', 'REJECTED'];

// Flagged means at least one reason and no decision yet (§3.1). It is worked
// out rather than stored, so the status the requester sees cannot show it.
export function isFlagged(status: RequestStatus, reasonCount: number): boolean {
  return reasonCount > 0 && !DECIDED.includes(status);
}
