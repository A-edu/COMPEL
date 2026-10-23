import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RequestStatus = "AWAITING_PROVIDER_RESPONSE" | "PROVIDER_RESPONDED";

// A neutral badge where colour appears only in the dot (after Untitled UI's
// BadgeWithDot, "modern" style). The label carries the meaning.
const STATUS: Record<RequestStatus, { label: string; dot: string }> = {
  AWAITING_PROVIDER_RESPONSE: { label: "Awaiting response", dot: "bg-[#f79009]" },
  PROVIDER_RESPONDED: { label: "Responded", dot: "bg-[#10b981]" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  const { label, dot } = STATUS[status];
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
