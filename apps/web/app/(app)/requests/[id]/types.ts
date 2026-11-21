import type { RequestStatus } from "@/components/app/status-badge";

// GET /api/requests/:id (spec §4). Dates arrive as ISO strings.

export interface RequestDocument {
  id: string;
  kind: "REQUEST_FORM" | "SUPPORTING";
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

export type Position = "ENDORSED" | "OBJECTED";

export interface ProviderResponse {
  ropaDocument: {
    id: string;
    originalName: string;
    sizeBytes: number;
    createdAt: string;
  };
  position: Position;
  objectionReason: string | null;
  createdAt: string;
}

export interface RequestDetail {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  createdAt: string;
  requestingEntity: { id: string; name: string };
  providingEntity: { id: string; name: string };
  myRole: "REQUESTER" | "PROVIDER";
  documents: RequestDocument[];
  // Present only for the provider: null until they respond.
  providerResponse?: ProviderResponse | null;
  // Present only for the provider, while the request is flagged.
  flagged?: true;
  // Present only for the requester, while a request the pipeline did not
  // auto-clear waits for an officer (Sprint 3 spec §2.7).
  underReview?: true;
}
