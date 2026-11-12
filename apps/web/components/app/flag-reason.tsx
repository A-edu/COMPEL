import { formatDateTime } from "@/lib/format";

// Labels for flag reason sources (Sprint 2 spec §3.2). A new source needs
// only an entry here to read well; without one, its identifier is shown, so
// nothing breaks.
const SOURCE_LABEL: Record<string, string> = {
  PROVIDER_OBJECTION: "Provider objection",
};

export function flagSourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export interface FlagReasonItem {
  id: string;
  source: string;
  text: string;
  createdAt: string;
  raisedAfterDecision?: true;
}

// One reason a request was flagged: where it came from, when it was raised,
// and its text verbatim and in full.
export function FlagReason({ reason }: { reason: FlagReasonItem }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">
          {flagSourceLabel(reason.source)}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          Raised{" "}
          <time dateTime={reason.createdAt}>
            {formatDateTime(reason.createdAt)}
          </time>
          {reason.raisedAfterDecision && " · after the decision"}
        </span>
      </div>
      <blockquote className="rounded-lg bg-sunken px-4 py-3 text-[15px] leading-6 break-words whitespace-pre-line text-ink-2">
        {reason.text}
      </blockquote>
    </div>
  );
}
