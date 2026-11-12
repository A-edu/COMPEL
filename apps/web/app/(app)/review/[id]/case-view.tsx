"use client";

import { useState } from "react";
import { CaseHeader } from "@/components/app/case-header";
import { CaseLayout } from "@/components/app/case-layout";
import { DecisionRecord } from "@/components/app/decision-record";
import { DossierSection } from "@/components/app/dossier-section";
import { EntityPair } from "@/components/app/entity-pair";
import { FileRow } from "@/components/app/file-row";
import { FlagReason, flagSourceLabel } from "@/components/app/flag-reason";
import {
  RecordTimeline,
  type RecordEvent,
} from "@/components/app/record-timeline";
import { surface } from "@/components/app/surface";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { officerVariant } from "@/lib/status";
import { cn } from "@/lib/utils";
import { AlreadyDecided, DecisionForm } from "./decision-form";
import type { ReviewCase } from "./types";

const DOCUMENTS_PATH = "/api/review/requests";

const POSITION_LABEL = { ENDORSED: "Endorsed", OBJECTED: "Objected" };

// Everything that exists so far on a case, as one dossier, with the panel the
// officer acts in beside it (Sprint 2 spec §7, §8; docs/design/sprint-2.md ->
// Case view).
export function CaseView({
  request,
  onDecided,
}: {
  request: ReviewCase;
  onDecided: () => void;
}) {
  // The officer's own justification when another officer decided first. Kept
  // here, above the reload that brings in the other decision, so it stays
  // until they leave or move on.
  const [conflict, setConflict] = useState<string | null>(null);

  const { decision } = request;
  const basedOn = [
    ...new Set(
      request.flagReasons
        .filter((reason) => !reason.raisedAfterDecision)
        .map((reason) => flagSourceLabel(reason.source)),
    ),
  ];

  let aside: React.ReactNode;
  if (decision && conflict !== null) {
    aside = (
      <AlreadyDecided
        decidedAt={decision.createdAt}
        justification={conflict}
        onDismiss={() => setConflict(null)}
      />
    );
  } else if (decision) {
    aside = <DecisionRecord decision={decision} basedOn={basedOn} />;
  } else if (request.flagged) {
    aside = (
      <DecisionForm
        requestId={request.id}
        reference={request.reference}
        onDecided={onDecided}
        onConflict={(justification) => {
          setConflict(justification);
          onDecided();
        }}
      />
    );
  } else {
    aside = <NothingToDecide providerName={request.providingEntity.name} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <CaseHeader
        back={{ href: "/review", label: "Review queue" }}
        title={request.title}
        reference={request.reference}
        status={officerVariant(request.status, request.flagged)}
      />
      <CaseLayout aside={aside}>
        <Dossier request={request} />
      </CaseLayout>
    </div>
  );
}

function Dossier({ request }: { request: ReviewCase }) {
  const response = request.providerResponse;
  const reasons = request.flagReasons;
  const requestForms = request.documents.filter(
    (d) => d.kind === "REQUEST_FORM",
  );
  const supporting = request.documents.filter((d) => d.kind === "SUPPORTING");

  return (
    <Card className={cn(surface, "gap-0 py-0")}>
      <DossierSection>
        <EntityPair
          parties={[
            {
              label: "Requester",
              ...request.requestingEntity,
              meta: `Submitted ${formatDateTime(request.createdAt)}`,
            },
            {
              label: "Provider",
              ...request.providingEntity,
              meta: response
                ? `Responded ${formatDateTime(response.createdAt)}`
                : "No response yet",
            },
          ]}
        />
      </DossierSection>

      {reasons.length > 0 && (
        <DossierSection
          title="Why it was flagged"
          meta={reasons.length === 1 ? "1 reason" : `${reasons.length} reasons`}
        >
          <ul className="flex flex-col gap-5">
            {reasons.map((reason) => (
              <li key={reason.id}>
                <FlagReason reason={reason} />
              </li>
            ))}
          </ul>
        </DossierSection>
      )}

      {/* The objection text is already a flag reason, so it isn't repeated. */}
      <DossierSection title="Provider's response">
        {response ? (
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Position
              </dt>
              <dd className="text-sm">{POSITION_LABEL[response.position]}</dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-medium text-muted-foreground">
                RoPA entry
              </dt>
              <dd>
                <FileRow
                  requestId={request.id}
                  document={response.ropaDocument}
                  basePath={DOCUMENTS_PATH}
                />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Not received. The RoPA entry and the provider&apos;s position will
            appear here once {request.providingEntity.name} responds.
          </p>
        )}
      </DossierSection>

      <DossierSection title="Submitted documents">
        <div className="flex flex-col gap-4">
          <DocumentGroup label="Request form">
            {requestForms.map((document) => (
              <li key={document.id}>
                <FileRow
                  requestId={request.id}
                  document={document}
                  basePath={DOCUMENTS_PATH}
                />
              </li>
            ))}
          </DocumentGroup>
          <DocumentGroup label="Supporting documents">
            {supporting.length > 0 ? (
              supporting.map((document) => (
                <li key={document.id}>
                  <FileRow
                    requestId={request.id}
                    document={document}
                    basePath={DOCUMENTS_PATH}
                  />
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">None submitted</li>
            )}
          </DocumentGroup>
        </div>
      </DossierSection>

      <DossierSection title="Record">
        <RecordTimeline events={recordOf(request)} />
      </DossierSection>
    </Card>
  );
}

function DocumentGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

// What happened to the request, in time order. "Provider reminded" waits for
// §9's reminder times.
function recordOf(request: ReviewCase): RecordEvent[] {
  const events: RecordEvent[] = [
    { key: "submitted", title: "Submitted", time: request.createdAt },
  ];
  if (request.providerResponse) {
    events.push({
      key: "responded",
      title: "Provider responded",
      time: request.providerResponse.createdAt,
      tone: "green",
    });
  }
  for (const reason of request.flagReasons) {
    events.push({
      key: `flag-${reason.id}`,
      title: "Flagged for a decision",
      detail: flagSourceLabel(reason.source),
      time: reason.createdAt,
      tone: "flag",
    });
  }
  const { decision } = request;
  if (decision) {
    events.push({
      key: "decision",
      title: decision.outcome === "APPROVED" ? "Approved" : "Rejected",
      // TODO(§10): add "both entities emailed" once the outcome emails exist.
      detail: (
        <span className="font-mono text-xs">{decision.decidedBy.email}</span>
      ),
      time: decision.createdAt,
      tone: decision.outcome === "APPROVED" ? "green" : "red",
    });
  }
  // Stable, so events with the same time keep the order above.
  return events.sort(
    (x, y) => new Date(x.time ?? 0).getTime() - new Date(y.time ?? 0).getTime(),
  );
}

// A pending request: nothing to decide yet.
function NothingToDecide({ providerName }: { providerName: string }) {
  return (
    <Card className={cn(surface, "gap-3 px-6 py-5")}>
      <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">
        Decision
      </h2>
      <p className="text-sm">
        The provider hasn&apos;t responded, so there is nothing to decide yet.
      </p>
      <p className="text-sm text-muted-foreground">
        If {providerName} objects, this request moves to Flagged and a decision
        becomes possible here. If it endorses, the request leaves the queue.
      </p>
    </Card>
  );
}
