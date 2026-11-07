import { PageHeader } from "@/components/app/page-header";
import { Reference } from "@/components/app/reference";
import { StatusBadge } from "@/components/app/status-badge";
import { surface } from "@/components/app/surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentLink } from "./document-link";
import { ResponseForm } from "./response-form";
import { ResponseSummary } from "./response-summary";
import type { RequestDetail } from "./types";

// §10: what both parties see, plus the provider's response panel. The grid
// stays two columns for the requester too, so the left card's width does
// not depend on the role; below lg the columns stack.
export function RequestDetailView({
  request,
  onResponded,
}: {
  request: RequestDetail;
  onResponded: () => void;
}) {
  const isRequester = request.myRole === "REQUESTER";
  const otherEntity = isRequester
    ? request.providingEntity
    : request.requestingEntity;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={request.title}
        description={
          <>
            <Reference value={request.reference} />
            <StatusBadge status={request.status} flagged={request.flagged} />
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className={surface}>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              {isRequester ? "To" : "From"}{" "}
              <span className="font-medium text-foreground">
                {otherEntity.name}
              </span>
            </p>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Documents</h2>
              <ul className="-mx-2 flex flex-col">
                {request.documents.map((document) => (
                  <li key={document.id}>
                    <DocumentLink requestId={request.id} document={document} />
                  </li>
                ))}
              </ul>
            </section>
          </CardContent>
        </Card>

        {request.providerResponse && (
          <Card className={surface}>
            <CardHeader>
              <CardTitle>Your response</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponseSummary
                requestId={request.id}
                response={request.providerResponse}
              />
            </CardContent>
          </Card>
        )}
        {request.providerResponse === null &&
          request.status === "AWAITING_PROVIDER_RESPONSE" && (
            <ResponseForm requestId={request.id} onSubmitted={onResponded} />
          )}
      </div>
    </div>
  );
}
