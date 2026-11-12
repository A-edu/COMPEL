import { FileRow } from "@/components/app/file-row";
import type { Position, ProviderResponse } from "./types";

const POSITION_LABEL: Record<Position, string> = {
  ENDORSED: "Endorsed",
  OBJECTED: "Objected",
};

// The provider's own response, read-only (§2.7): Position, the reason in full
// and the RoPA entry (docs/design/sprint-2.md -> Provider: request under
// review). Shown to the provider only.
export function ResponseSummary({
  requestId,
  response,
}: {
  requestId: string;
  response: ProviderResponse;
}) {
  return (
    <dl className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <dt className="text-xs font-medium text-muted-foreground">Position</dt>
        <dd className="text-sm">{POSITION_LABEL[response.position]}</dd>
      </div>
      {response.objectionReason && (
        <div className="flex flex-col gap-1.5">
          <dt className="text-xs font-medium text-muted-foreground">Reason</dt>
          <dd className="rounded-lg bg-sunken px-4 py-3 text-[15px] leading-6 break-words whitespace-pre-line text-ink-2">
            {response.objectionReason}
          </dd>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <dt className="text-xs font-medium text-muted-foreground">
          RoPA entry
        </dt>
        <dd>
          <FileRow requestId={requestId} document={response.ropaDocument} />
        </dd>
      </div>
    </dl>
  );
}
