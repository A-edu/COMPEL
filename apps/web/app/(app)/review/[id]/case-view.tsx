import { DocumentLink } from "@/app/(app)/requests/[id]/document-link";
import { ResponseSummary } from "@/app/(app)/requests/[id]/response-summary";
import { PageHeader } from "@/components/app/page-header";
import { Reference } from "@/components/app/reference";
import { StatusBadge } from "@/components/app/status-badge";
import { surface } from "@/components/app/surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecisionForm } from "./decision-form";
import type { FlagReason, ReviewCase } from "./types";

const DOCUMENTS_PATH = "/api/review/requests";

const SOURCE_LABEL: Record<string, string> = {
  PROVIDER_OBJECTION: "Provider objection",
};

const raisedOn = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

// A source with no label yet still reads properly, so a new source needs no
// change here (Sprint 2 spec §3.2).
function sourceLabel(source: string) {
  const known = SOURCE_LABEL[source];
  if (known) return known;
  const words = source.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
              status={request.status}
              flagged={request.flagged}
              flaggedLabel="Flagged"
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
              <ul className="-mx-2 flex flex-col">
                {request.documents.map((document) => (
                  <li key={document.id}>
                    <DocumentLink
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

function Reason({ reason }: { reason: FlagReason }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{sourceLabel(reason.source)}</span>
        <time
          dateTime={reason.createdAt}
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
        >
          {raisedOn.format(new Date(reason.createdAt))}
        </time>
      </div>
      <p className="text-sm whitespace-pre-line text-neutral-700">
        {reason.text}
      </p>
    </div>
  );
}
