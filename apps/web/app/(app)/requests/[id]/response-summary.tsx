import { DocumentLink } from "./document-link";
import type { Position, ProviderResponse } from "./types";

const POSITION_LABEL: Record<Position, string> = {
  ENDORSED: "Endorsed",
  OBJECTED: "Objected",
};

// The provider's response, read-only (§2.7). Officers read it too, and open
// the RoPA entry through their own route (`basePath`).
export function ResponseSummary({
  requestId,
  response,
  basePath,
}: {
  requestId: string;
  response: ProviderResponse;
  basePath?: string;
}) {
  return (
    <dl className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <dt className="text-sm font-medium">RoPA entry</dt>
        <dd className="-mx-2">
          <DocumentLink
            requestId={requestId}
            document={response.ropaDocument}
            basePath={basePath}
          />
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-sm font-medium">Position</dt>
        <dd className="text-sm text-neutral-700">
          {POSITION_LABEL[response.position]}
        </dd>
      </div>
      {response.objectionReason && (
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-medium">Reason</dt>
          <dd className="text-sm whitespace-pre-line text-neutral-700">
            {response.objectionReason}
          </dd>
        </div>
      )}
    </dl>
  );
}
