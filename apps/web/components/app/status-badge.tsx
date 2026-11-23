import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RequestStatus =
  | "AWAITING_PROVIDER_RESPONSE"
  | "UNDER_AUTOMATED_REVIEW"
  | "PROVIDER_RESPONDED"
  | "APPROVED"
  | "REJECTED";

// What the badge shows. The caller picks the variant for its audience
// (lib/status.ts, Sprint 2 spec §3.1); the badge never decides who sees what.
export type StatusVariant =
  | "awaiting"
  | "automatedReview"
  | "responded"
  | "underReview"
  | "flagged"
  | "approved"
  | "rejected";

const LABELS: Record<StatusVariant, string> = {
  awaiting: "Awaiting response",
  automatedReview: "Under automated review",
  responded: "Responded",
  underReview: "Under review",
  flagged: "Flagged",
  approved: "Approved",
  rejected: "Rejected",
};

// The line glyph of each status (docs/design/sprint-2.md -> Status
// vocabulary): the circle fills as a request moves forward. Colour only for
// Approved, Rejected and Flagged; `currentColor` is the status ink.
const GLYPHS: Record<StatusVariant, React.ReactNode> = {
  awaiting: (
    <circle
      cx="8"
      cy="8"
      r="6"
      className="stroke-status-pending"
      strokeWidth="1.5"
      strokeDasharray="2.4 2.1"
      strokeLinecap="round"
    />
  ),
  automatedReview: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6"
        className="stroke-status-track"
        strokeWidth="1.5"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  underReview: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6a3.4 3.4 0 0 1 0 6.8z" fill="currentColor" />
    </>
  ),
  responded: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8V4.6a3.4 3.4 0 1 1-3.4 3.4z" fill="currentColor" />
    </>
  ),
  approved: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6"
        className="stroke-status-approved"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="8" r="3.4" className="fill-status-approved" />
    </>
  ),
  rejected: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6"
        className="stroke-status-alert"
        strokeWidth="1.5"
      />
      <path
        d="M4.4 11.6 11.6 4.4"
        className="stroke-status-alert"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  flagged: (
    <>
      <rect
        x="2.25"
        y="2.25"
        width="11.5"
        height="11.5"
        rx="3"
        className="stroke-status-alert"
        strokeWidth="1.5"
      />
      <path
        d="M8 5.2v3.3"
        className="stroke-status-alert"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="10.9" r="0.9" className="fill-status-alert" />
    </>
  ),
};

// The glyph on its own, where a status is shown outside a badge (an outcome
// panel, a decision record). Decorative: the label beside it carries the
// meaning.
export function StatusGlyph({
  variant,
  className,
}: {
  variant: StatusVariant;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("size-[13px] shrink-0 text-status-ink", className)}
    >
      {GLYPHS[variant]}
    </svg>
  );
}

// A neutral badge with the status glyph where a dot used to be. The label
// carries the meaning.
export function StatusBadge({
  variant,
  className,
}: {
  variant: StatusVariant;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-[22px] gap-1.5 rounded-md border-0 bg-card py-0 pr-2 pl-1.5 text-xs font-medium text-ink-2 shadow-xs ring-1 ring-border ring-inset [&>svg]:size-[13px]!",
        className,
      )}
    >
      <StatusGlyph variant={variant} />
      {LABELS[variant]}
    </Badge>
  );
}
