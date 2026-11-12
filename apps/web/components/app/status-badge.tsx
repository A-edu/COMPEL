import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RequestStatus =
  | "AWAITING_PROVIDER_RESPONSE"
  | "PROVIDER_RESPONDED"
  | "APPROVED"
  | "REJECTED";

// What the badge shows. The caller picks the variant for its audience
// (lib/status.ts, Sprint 2 spec §3.1); the badge never decides who sees what.
export type StatusVariant =
  | "awaiting"
  | "responded"
  | "underReview"
  | "flagged"
  | "approved"
  | "rejected";

// A neutral badge where colour appears only in the dot, or in the flag glyph
// that officers see (docs/design/sprint-2.md -> Paper and ink). The label
// carries the meaning.
const VARIANTS: Record<StatusVariant, { label: string; dot?: string }> = {
  awaiting: { label: "Awaiting response", dot: "bg-[#f79009]" },
  responded: { label: "Responded", dot: "bg-[#10b981]" },
  underReview: { label: "Under review", dot: "bg-[#f79009]" },
  flagged: { label: "Flagged" },
  approved: { label: "Approved", dot: "bg-[#10b981]" },
  rejected: { label: "Rejected", dot: "bg-[#f04438]" },
};

export function StatusBadge({
  variant,
  className,
}: {
  variant: StatusVariant;
  className?: string;
}) {
  const { label, dot } = VARIANTS[variant];
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-[22px] gap-1.5 rounded-md border-0 bg-card py-0 pr-2 pl-[7px] text-xs font-medium text-ink-2 shadow-xs ring-1 ring-border ring-inset",
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      ) : (
        <Flag
          aria-hidden
          className="size-[11px]! fill-[#d92d20] text-[#d92d20]"
        />
      )}
      {label}
    </Badge>
  );
}
