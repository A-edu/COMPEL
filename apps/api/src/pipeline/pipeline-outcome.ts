import type { Prisma } from '@prisma/client';

// What happens to the request when its run completes, inside the transaction
// that marks the run COMPLETED.
//
// TODO(§8): apply the outcome rule here, from the saved step results: record
// a system approval only when every check passed and the provider endorsed
// the request; otherwise raise the pipeline's flag reasons. Until then a
// completed run leaves the request as Sprint 2 did: Responded, flagged only
// if it already has a reason (an objection), and never approved.
export async function completeReview(
  tx: Prisma.TransactionClient,
  requestId: string,
  _results: Record<string, unknown>,
): Promise<void> {
  await leaveAutomatedReview(tx, requestId);
}

// Moves a request out of automated review once its run has ended. It lands
// on the Sprint 2 status; whether it is flagged is worked out from its active
// flag reasons (spec §3.1).
export async function leaveAutomatedReview(
  db: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  await db.dataSharingRequest.updateMany({
    where: { id: requestId, status: 'UNDER_AUTOMATED_REVIEW' },
    data: { status: 'PROVIDER_RESPONDED' },
  });
}
