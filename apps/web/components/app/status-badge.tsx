import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RequestStatus =
  | "AWAITING_PROVIDER_RESPONSE"
  | "PROVIDER_RESPONDED"
  | "APPROVED"
  | "REJECTED";

// A neutral badge where colour appears only in the dot (after Untitled UI's
// BadgeWithDot, "modern" style). The label carries the meaning.
const STATUS: Record<RequestStatus, { label: string; dot: string }> = {
  AWAITING_PROVIDER_RESPONSE: { label: "Awaiting response", dot: "bg-[#f79009]" },
  PROVIDER_RESPONDED: { label: "Responded", dot: "bg-[#10b981]" },
  APPROVED: { label: "Approved", dot: "bg-[#10b981]" },
  REJECTED: { label: "Rejected", dot: "bg-[#f04438]" },
};

// A flagged request has a different label for each audience (Sprint 2 spec
// §3.1): the provider sees "Under review" and an officer "Flagged". The API
// never sends `flagged` to the requester, who keeps seeing the status.
const FLAGGED_DOT = "bg-[#f79009]";

export function StatusBadge({
  status,
  flagged,
  flaggedLabel = "Under review",
  className,
}: {
  status: RequestStatus;
  flagged?: boolean;
  flaggedLabel?: string;
  className?: string;
}) {
  const { label, dot } = flagged
    ? { label: flaggedLabel, dot: FLAGGED_DOT }
    : STATUS[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-[22px] gap-1.5 rounded-md border-0 bg-white py-0 pr-2 pl-[7px] text-xs font-medium text-neutral-700 shadow-xs ring-1 ring-neutral-200 ring-inset",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </Badge>
  );
}
