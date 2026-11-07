import type {
  ProviderResponse,
  RequestDocument,
} from "@/app/(app)/requests/[id]/types";
import type { RequestStatus } from "@/components/app/status-badge";

// GET /api/review/requests/:id (Sprint 2 spec §7). Dates arrive as ISO strings.

export interface FlagReason {
  id: string;
  source: string;
  text: string;
  createdAt: string;
  // Only on a reason that arrived after the decision.
  raisedAfterDecision?: true;
}

export interface Decision {
  outcome: "APPROVED" | "REJECTED";
  justification: string;
  createdAt: string;
  decidedBy: { email: string };
}

export interface ReviewCase {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  createdAt: string;
  requestingEntity: { id: string; name: string };
  providingEntity: { id: string; name: string };
  documents: RequestDocument[];
  // Null until the provider responds.
  providerResponse: ProviderResponse | null;
  flagReasons: FlagReason[];
  // Null until an officer decides.
  decision: Decision | null;
}
