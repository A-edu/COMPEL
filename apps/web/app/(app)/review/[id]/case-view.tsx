import { ResponseSummary } from "@/app/(app)/requests/[id]/response-summary";
import { FileRow } from "@/components/app/file-row";
import { flagSourceLabel } from "@/components/app/flag-reason";
import { PageHeader } from "@/components/app/page-header";
import { Reference } from "@/components/app/reference";
import { StatusBadge } from "@/components/app/status-badge";
import { surface } from "@/components/app/surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { officerVariant } from "@/lib/status";
import { DecisionForm } from "./decision-form";
import type { Decision, FlagReason, ReviewCase } from "./types";

const DOCUMENTS_PATH = "/api/review/requests";

const OUTCOME_LABEL: Record<Decision["outcome"], string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const raisedOn = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const decidedOn = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Everything that exists so far on a case (Sprint 2 spec §7).
export function CaseView({
  request,
  onDecided,
}: {
  request: ReviewCase;
  onDecided: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={request.title}
        description={
          <>
            <Reference value={request.reference} />
            <StatusBadge
              variant={officerVariant(request.status, request.flagged)}
            />
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={surface}>
          <CardContent className="flex flex-col gap-6">
            <dl className="flex flex-col gap-5">
              <Party label="Requesting entity" name={request.requestingEntity.name} />
              <Party label="Providing entity" name={request.providingEntity.name} />
            </dl>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Documents</h2>
              <ul className="flex flex-col gap-2">
                {request.documents.map((document) => (
                  <li key={document.id}>
                    <FileRow
                      requestId={request.id}
                      document={document}
                      basePath={DOCUMENTS_PATH}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          {request.decision && <DecisionRecord decision={request.decision} />}

          <Card className={surface}>
            <CardHeader>
              <CardTitle>Provider response</CardTitle>
            </CardHeader>
            <CardContent>
              {request.providerResponse ? (
                <ResponseSummary
                  requestId={request.id}
                  response={request.providerResponse}
                  basePath={DOCUMENTS_PATH}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The provider has not responded yet.
                </p>
              )}
            </CardContent>
          </Card>

          {request.flagReasons.length > 0 && (
            <Card className={surface}>
              <CardHeader>
                <CardTitle>Flag reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-5">
                  {request.flagReasons.map((reason) => (
                    <li key={reason.id}>
                      <Reason reason={reason} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {request.flagged && (
            <DecisionForm requestId={request.id} onDecided={onDecided} />
          )}
        </div>
      </div>
    </div>
  );
}

function Party({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{name}</dd>
    </div>
  );
}

// The stored decision, read-only (Sprint 2 spec §8.2).
function DecisionRecord({ decision }: { decision: Decision }) {
  return (
    <Card className={surface}>
      <CardHeader>
        <CardTitle>Decision</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium">Outcome</dt>
            <dd className="text-sm text-ink-2">
              {OUTCOME_LABEL[decision.outcome]}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium">Decided on</dt>
            <dd className="text-sm text-ink-2 tabular-nums">
              <time dateTime={decision.createdAt}>
                {decidedOn.format(new Date(decision.createdAt))}
              </time>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium">Officer</dt>
            <dd className="font-mono text-sm break-all text-ink-2">
              {decision.decidedBy.email}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium">Justification</dt>
            <dd className="text-sm break-words whitespace-pre-line text-ink-2">
              {decision.justification}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function Reason({ reason }: { reason: FlagReason }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{flagSourceLabel(reason.source)}</span>
        <time
          dateTime={reason.createdAt}
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
        >
          {raisedOn.format(new Date(reason.createdAt))}
        </time>
      </div>
      <p className="text-sm whitespace-pre-line text-ink-2">
        {reason.text}
      </p>
      {reason.raisedAfterDecision && (
        <p className="text-xs text-muted-foreground">
          Raised after the decision
        </p>
      )}
    </div>
  );
}
