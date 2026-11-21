import type {
  RequestStatus,
  StatusVariant,
} from "@/components/app/status-badge";

// Which StatusBadge variant each audience gets (Sprint 2 spec §3.1, Sprint 3
// spec §3.1). The API decides what each audience is told: the provider gets
// `flagged`, and the requester gets `underReview` only for a request the
// pipeline did not auto-clear (§2.7). A request flagged before Sprint 3 still
// shows its requester "Responded".

// Shown to every audience whatever else is true (Sprint 3 spec §3.1): a
// request under automated review is never flagged, and nobody can decide it.
const FIXED: Partial<Record<RequestStatus, StatusVariant>> = {
  UNDER_AUTOMATED_REVIEW: "automatedReview",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// A requester or provider: the provider's `flagged`, or the requester's
// `underReview`.
export function partyVariant(
  status: RequestStatus,
  flagged?: boolean,
): StatusVariant {
  return (
    FIXED[status] ??
    (flagged
      ? "underReview"
      : status === "AWAITING_PROVIDER_RESPONSE"
        ? "awaiting"
        : "responded")
  );
}

// A compliance officer. A flagged request is "Flagged" whatever its status.
export function officerVariant(
  status: RequestStatus,
  flagged: boolean,
): StatusVariant {
  return (
    FIXED[status] ??
    (flagged
      ? "flagged"
      : status === "AWAITING_PROVIDER_RESPONSE"
        ? "awaiting"
        : "responded")
  );
}
