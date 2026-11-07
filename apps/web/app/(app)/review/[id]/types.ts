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
}
