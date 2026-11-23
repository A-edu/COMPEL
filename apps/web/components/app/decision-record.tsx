import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusGlyph } from "./status-badge";
import { surface } from "./surface";

// A system decision (Sprint 3 spec §2.6, §3.5) is always an approval, has no
// officer and no justification: the check report stored with it takes the
// justification's place. TODO(§9.1, §9.2): show `report` here.
export interface DecisionRecordData {
  outcome: "APPROVED" | "REJECTED";
  madeBy: "OFFICER" | "SYSTEM";
  justification: string | null;
  createdAt: string;
  decidedBy: { email: string } | null;
  report: unknown;
}

const OUTCOME = {
  APPROVED: { label: "Approved", glyph: "approved" },
  REJECTED: { label: "Rejected", glyph: "rejected" },
} as const;

// A stored decision, read-only (Sprint 2 spec §8.2): the outcome, when, the
// officer or the system, the flag reasons it was based on and the
// justification in full. For compliance officers only, since the
// justification is.
export function DecisionRecord({
  decision,
  basedOn,
}: {
  decision: DecisionRecordData;
  // Source labels of the reasons that led to it.
  basedOn: string[];
}) {
  const outcome = OUTCOME[decision.outcome];
  return (
    <Card className={cn(surface, "gap-5 px-6 py-5")}>
      <div className="flex flex-col gap-2">
        <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">
          Decision
        </h2>
        <p className="flex items-center gap-2 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
          <StatusGlyph variant={outcome.glyph} className="size-4" />
          {outcome.label}
        </p>
      </div>
      <dl className="flex flex-col gap-3 text-sm">
        <Row label="When">
          <time dateTime={decision.createdAt} className="tabular-nums">
            {formatDateTime(decision.createdAt)}
          </time>
        </Row>
        {decision.decidedBy ? (
          <Row label="Officer">
            <span className="font-mono text-[13px] break-all">
              {decision.decidedBy.email}
            </span>
          </Row>
        ) : (
          <Row label="Decided by">The system, under the outcome rule</Row>
        )}
        {basedOn.length > 0 && (
          <Row label="Based on">{basedOn.join(", ")}</Row>
        )}
      </dl>
      {decision.justification !== null ? (
        <div className="flex flex-col gap-2 border-t border-hairline pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">
            Justification
          </h3>
          <p className="text-[15px] leading-6 break-words whitespace-pre-line text-ink-2">
            {decision.justification}
          </p>
        </div>
      ) : (
        <p className="border-t border-hairline pt-4 text-[15px] leading-6 text-ink-2">
          Every check passed and the provider endorsed the request. The check
          report takes the place of a justification.
        </p>
      )}
      <p className="flex gap-2 border-t border-hairline pt-4 text-[13px] text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Final and permanent. The entities see &ldquo;{outcome.label}&rdquo;;
          only compliance officers see this record.
        </span>
      </p>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
