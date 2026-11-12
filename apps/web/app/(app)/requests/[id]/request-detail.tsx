import Link from "next/link";
import { CaseHeader } from "@/components/app/case-header";
import { CaseLayout } from "@/components/app/case-layout";
import { DossierSection } from "@/components/app/dossier-section";
import { EntityPair } from "@/components/app/entity-pair";
import { FileRow } from "@/components/app/file-row";
import {
  RecordTimeline,
  type RecordEvent,
} from "@/components/app/record-timeline";
import { surface, surfaceFlush } from "@/components/app/surface";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { partyVariant } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ResponseForm } from "./response-form";
import { ResponseSummary } from "./response-summary";
import type { RequestDetail } from "./types";

const PANEL_TITLE = "text-[17px] leading-6 font-semibold tracking-[-0.01em]";

// A request as one of its parties sees it (§10; Sprint 2 spec §3.1,
// docs/design/sprint-2.md). The left column is what both parties share; the
// right is the provider's response or, once decided, the requester's outcome.
//
// The requester's detail carries no response, position, RoPA entry or flag
// (AGENTS.md -> Access rules 3), and nothing here reads them for the
// requester: everything provider-only sits behind `isProvider`.
export function RequestDetailView({
  request,
  onResponded,
}: {
  request: RequestDetail;
  onResponded: () => void;
}) {
  const isProvider = request.myRole === "PROVIDER";

  return (
    <div className="flex flex-col gap-8">
      <CaseHeader
        back={{
          href: isProvider ? "/requests?tab=received" : "/requests",
          label: "Requests",
        }}
        title={request.title}
        reference={request.reference}
        status={partyVariant(
          request.status,
          isProvider ? request.flagged : undefined,
        )}
      />
      <CaseLayout
        aside={
          isProvider ? (
            <ProviderPanel request={request} onResponded={onResponded} />
          ) : (
            <Outcome status={request.status} />
          )
        }
      >
        <Card className={surfaceFlush}>
          <DossierSection>
            <EntityPair
              parties={[
                isProvider
                  ? { label: "From", name: request.requestingEntity.name }
                  : { label: "To", name: request.providingEntity.name },
              ]}
            />
          </DossierSection>
          <DossierSection
            title={isProvider ? "Documents" : "Documents you submitted"}
          >
            <ul className="flex flex-col gap-2">
              {request.documents.map((document) => (
                <li key={document.id}>
                  <FileRow requestId={request.id} document={document} />
                </li>
              ))}
            </ul>
          </DossierSection>
          <DossierSection title="Record">
            <RecordTimeline
              events={
                isProvider ? providerRecord(request) : requesterRecord(request)
              }
            />
          </DossierSection>
        </Card>
      </CaseLayout>
    </div>
  );
}

// Only events the party's own data proves. Where the API proves an event but
// not when, it has no time (docs/design/sprint-2.md -> Provider and requester
// screens: Record).
function outcomeEvent(status: RequestDetail["status"]): RecordEvent | null {
  if (status === "APPROVED") {
    return {
      key: "outcome",
      title: "Approved by a compliance officer",
      tone: "green",
    };
  }
  if (status === "REJECTED") {
    return {
      key: "outcome",
      title: "Rejected by a compliance officer",
      tone: "red",
    };
  }
  return null;
}

function requesterRecord(request: RequestDetail): RecordEvent[] {
  const events: RecordEvent[] = [
    {
      key: "submitted",
      title: "You submitted the request",
      time: request.createdAt,
    },
  ];
  // Only while the status says so: once decided, the status no longer proves
  // a response (Sprint 2 spec §3.3).
  if (request.status === "PROVIDER_RESPONDED") {
    events.push({
      key: "responded",
      title: `${request.providingEntity.name} responded`,
      tone: "green",
    });
  }
  const outcome = outcomeEvent(request.status);
  if (outcome) events.push(outcome);
  return events;
}

function providerRecord(request: RequestDetail): RecordEvent[] {
  const events: RecordEvent[] = [
    {
      key: "received",
      title: `Received from ${request.requestingEntity.name}`,
      time: request.createdAt,
    },
  ];
  if (request.providerResponse) {
    events.push({
      key: "responded",
      title: "You responded",
      time: request.providerResponse.createdAt,
      tone: "green",
    });
  }
  if (request.flagged) {
    events.push({ key: "review", title: "Sent for review", tone: "amber" });
  }
  const outcome = outcomeEvent(request.status);
  if (outcome) events.push(outcome);
  return events;
}

// The provider's side: the response form before a response, then the
// response read-only, beneath the review strip while it is under review.
function ProviderPanel({
  request,
  onResponded,
}: {
  request: RequestDetail;
  onResponded: () => void;
}) {
  if (
    request.providerResponse === null &&
    request.status === "AWAITING_PROVIDER_RESPONSE"
  ) {
    return <ResponseForm requestId={request.id} onSubmitted={onResponded} />;
  }
  if (!request.providerResponse) return null;

  return (
    <>
      {request.flagged && (
        <Card className={cn(surface, "gap-1 px-5 py-4")}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="size-1.5 rounded-full bg-[#f79009]" />
            A compliance officer is reviewing this request.
          </p>
          {/* TODO(§10): lead with "You'll be emailed the outcome at your data
              office address." once the outcome emails exist. */}
          <p className="pl-3.5 text-[13px] text-muted-foreground">
            Nothing else is needed from you.
          </p>
        </Card>
      )}
      <Card className={cn(surface, "gap-4 px-6 py-5")}>
        <h2 className={PANEL_TITLE}>Your response</h2>
        <ResponseSummary
          requestId={request.id}
          response={request.providerResponse}
        />
      </Card>
    </>
  );
}

// The requester's outcome once an officer has decided. The party API sends
// no decision date, so there is none here.
function Outcome({ status }: { status: RequestDetail["status"] }) {
  if (status !== "APPROVED" && status !== "REJECTED") return null;
  const approved = status === "APPROVED";

  return (
    <Card className={cn(surface, "gap-3 px-6 py-5")}>
      <h2 className="text-xs font-medium text-muted-foreground">Outcome</h2>
      <p className="flex items-center gap-2 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            approved ? "bg-[#10b981]" : "bg-[#f04438]",
          )}
        />
        {approved ? "Approved" : "Rejected"}
      </p>
      <p className="text-sm">
        A compliance officer {approved ? "approved" : "rejected"} this request.
      </p>
      {!approved && (
        <>
          <p className="text-sm text-muted-foreground">
            This decision is final. To pursue the same data, submit a new
            request.
          </p>
          <Button asChild variant="outline" className="mt-1 w-fit">
            <Link href="/requests/new">New request</Link>
          </Button>
        </>
      )}
    </Card>
  );
}
