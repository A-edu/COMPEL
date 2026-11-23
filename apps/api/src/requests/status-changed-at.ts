import type { RequestStatus } from '@prisma/client';

// When the status a party sees last changed: the requests list's Updated
// date (docs/design/sprint-2.md -> DPO requests list). It is worked out only
// from what the caller's status already shows, never from
// DataSharingRequest.updatedAt, flag reasons or findings, so it reveals
// nothing the status doesn't.

// The stage the caller sees (Sprint 3 spec §3.1), decided by the same rules
// as its status: `flagged` for the provider, `underReview` for the requester.
export type VisibleStage =
  'awaiting' | 'automatedReview' | 'underReview' | 'responded' | 'decided';

const FIXED: Partial<Record<RequestStatus, VisibleStage>> = {
  UNDER_AUTOMATED_REVIEW: 'automatedReview',
  APPROVED: 'decided',
  REJECTED: 'decided',
};

// The same rule as partyVariant() in the web app. `shownUnderReview` is the
// flag the caller's row already carries: the provider's `flagged` or the
// requester's `underReview`.
export function visibleStage(
  status: RequestStatus,
  shownUnderReview: boolean,
): VisibleStage {
  return (
    FIXED[status] ??
    (shownUnderReview
      ? 'underReview'
      : status === 'AWAITING_PROVIDER_RESPONSE'
        ? 'awaiting'
        : 'responded')
  );
}

export interface StatusTimes {
  createdAt: Date;
  // ProviderResponse.createdAt.
  respondedAt: Date | null;
  // Decision.createdAt, by an officer or the system.
  decidedAt: Date | null;
  // The request's latest pipeline run.
  latestRun: { createdAt: Date; endedAt: Date | null } | null;
}

export function statusChangedAt(
  stage: VisibleStage,
  { createdAt, respondedAt, decidedAt, latestRun }: StatusTimes,
): Date {
  switch (stage) {
    case 'awaiting':
      return createdAt;
    // The response (or a correction) sets the status in the transaction
    // that creates the run, so the run's creation is the change. Its
    // startedAt comes later, once a step is claimed.
    case 'automatedReview':
      return latestRun?.createdAt ?? respondedAt ?? createdAt;
    // After a run: the run's end moved the request out of automated review,
    // including a correction's run. Before Sprint 3 (no run): the objection
    // was recorded with the response.
    case 'underReview':
      return (latestRun ? latestRun.endedAt : null) ?? respondedAt ?? createdAt;
    // Responded before Sprint 3. For the requester this is also a request
    // the provider objected to, so an objection and an endorsement give the
    // same time (Sprint 2 spec §3.1).
    case 'responded':
      return respondedAt ?? createdAt;
    case 'decided':
      return decidedAt ?? respondedAt ?? createdAt;
  }
}
