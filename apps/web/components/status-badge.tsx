import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RequestStatus = "AWAITING_PROVIDER_RESPONSE" | "PROVIDER_RESPONDED";

// Colour carries meaning here, so it is one of the few places it appears
// (AGENTS.md -> Design system).
const STATUS: Record<RequestStatus, { label: string; className: string }> = {
  AWAITING_PROVIDER_RESPONSE: {
    label: "Awaiting response",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  PROVIDER_RESPONDED: {
    label: "Responded",
    className: "border-green-200 bg-green-50 text-green-800",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  const { label, className: colours } = STATUS[status];
  return (
    <Badge variant="outline" className={cn(colours, className)}>
      {label}
    </Badge>
  );
}
