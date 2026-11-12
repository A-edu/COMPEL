import type {
  ProviderResponse,
  RequestDocument,
} from "@/app/(app)/requests/[id]/types";
import type { DecisionRecordData } from "@/components/app/decision-record";
import type { FlagReasonItem } from "@/components/app/flag-reason";
import type { RequestStatus } from "@/components/app/status-badge";

// GET /api/review/requests/:id (Sprint 2 spec §7). Dates arrive as ISO strings.

export type FlagReason = FlagReasonItem;

export type Decision = DecisionRecordData;

export interface CaseEntity {
  id: string;
  name: string;
  slug: string;
}

export interface ReviewCase {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  createdAt: string;
  requestingEntity: CaseEntity;
  providingEntity: CaseEntity;
  documents: RequestDocument[];
  // Null until the provider responds.
  providerResponse: ProviderResponse | null;
  flagReasons: FlagReason[];
  // Null until an officer decides.
  decision: Decision | null;
}
