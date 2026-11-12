import type {
  RequestStatus,
  StatusVariant,
} from "@/components/app/status-badge";

// Which StatusBadge variant each audience gets (Sprint 2 spec §3.1). The API
// decides what each audience is told: `flagged` reaches a DPO only on the
// provider's side, so the requester can never be shown "Under review".

const DECIDED: Partial<Record<RequestStatus, StatusVariant>> = {
  APPROVED: "approved",
  REJECTED: "rejected",
};

// A requester or provider. `flagged` is present only for the provider.
export function partyVariant(
  status: RequestStatus,
  flagged?: boolean,
): StatusVariant {
  return (
    DECIDED[status] ??
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
    DECIDED[status] ??
    (flagged
      ? "flagged"
      : status === "AWAITING_PROVIDER_RESPONSE"
        ? "awaiting"
        : "responded")
  );
}
