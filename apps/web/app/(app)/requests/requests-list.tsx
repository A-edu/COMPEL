"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Reference } from "@/components/app/reference";
import { segmentedList, segmentedTrigger } from "@/components/app/segmented";
import { ListSkeleton } from "@/components/app/skeletons";
import { StatusBadge, type RequestStatus } from "@/components/app/status-badge";
import { surfaceFlush } from "@/components/app/surface";
import { WaitingTime } from "@/components/app/waiting-time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";
import { partyVariant } from "@/lib/status";
import { cn } from "@/lib/utils";

type Tab = "sent" | "received";

// GET /api/requests (spec §4 -> List item). Dates arrive as ISO strings.
interface RequestListItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  createdAt: string;
  flagged?: true;
  counterpartEntity: { id: string; name: string };
}

type Result = { requests: RequestListItem[] } | { error: string };

// Each tab is one surface with two groups: what still waits on the provider,
// then everything it has responded to (docs/design/sprint-2.md -> DPO
// requests list).
const GROUPS: Record<
  Tab,
  { waiting: string; responded: string; counterpart: string }
> = {
  received: {
    waiting: "Awaiting your response",
    responded: "Responded",
    counterpart: "From",
  },
  sent: {
    waiting: "Waiting for a response",
    responded: "Responded",
    counterpart: "To",
  },
};

const isWaiting = (r: RequestListItem) =>
  r.status === "AWAITING_PROVIDER_RESPONSE";

// Request · counterpart · waiting · status · chevron. Both groups share it so
// their columns line up; the Responded group leaves Waiting empty.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_5.5rem_9rem_1rem] sm:gap-6";

// The active tab lives in the URL (?tab=received); anything else is Sent.
export function RequestsList() {
  const tab: Tab =
    useSearchParams().get("tab") === "received" ? "received" : "sent";
  // The last result per tab, so switching back shows it at once while it
  // reloads. Kept in state, not a module, so it ends with the page (and
  // never outlives a logout). Missing while loading.
  const [results, setResults] = useState<Partial<Record<Tab, Result>>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Received is loaded on the Sent tab too, for its count of requests
    // awaiting a response.
    const tabs: Tab[] = tab === "received" ? ["received"] : ["sent", "received"];
    for (const direction of tabs) {
      const settle = (result: Result) =>
        setResults((prev) => ({ ...prev, [direction]: result }));
      api<RequestListItem[]>(`/requests?direction=${direction}`, {
        signal: controller.signal,
      })
        .then((requests) => settle({ requests }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          settle({
            error: error instanceof ApiError ? error.message : FALLBACK_ERROR,
          });
        });
    }
    return () => controller.abort();
  }, [tab, attempt]);

  function selectTab(value: string) {
    // The native History API keeps useSearchParams in sync without a
    // server round trip.
    window.history.replaceState(
      null,
      "",
      value === "received" ? "/requests?tab=received" : "/requests",
    );
  }

  function retry() {
    setResults((prev) => ({ ...prev, [tab]: undefined }));
    setAttempt((n) => n + 1);
  }

  const received = results.received;
  const awaitingCount =
    received && "requests" in received
      ? received.requests.filter(isWaiting).length
      : 0;

  return (
    <Tabs value={tab} onValueChange={selectTab} className="gap-4">
      <TabsList className={segmentedList}>
        <TabsTrigger value="sent" className={segmentedTrigger}>
          Sent
        </TabsTrigger>
        <TabsTrigger value="received" className={segmentedTrigger}>
          Received
          {awaitingCount > 0 && (
            <span className="text-muted-foreground tabular-nums">
              <span className="sr-only">, awaiting your response: </span>
              {awaitingCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value={tab}>
        <RequestsCard direction={tab} result={results[tab]} onRetry={retry} />
      </TabsContent>
    </Tabs>
  );
}

// Shown until the URL can be read on the client.
export function RequestsListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-44 rounded-lg" />
      <Card className={surfaceFlush}>
        <ListSkeleton />
      </Card>
    </div>
  );
}

function RequestsCard({
  direction,
  result,
  onRetry,
}: {
  direction: Tab;
  result: Result | undefined;
  onRetry: () => void;
}) {
  if (result === undefined) {
    return (
      <Card className={surfaceFlush}>
        <ListSkeleton />
      </Card>
    );
  }
  if ("error" in result) {
    return (
      <Card className={surfaceFlush}>
        <ErrorState message={result.error} onRetry={onRetry} />
      </Card>
    );
  }
  if (result.requests.length === 0) {
    return (
      <Card className={surfaceFlush}>
        {direction === "sent" ? (
          <EmptyState
            title="No requests sent yet."
            action={
              <Button asChild>
                <Link href="/requests/new">New request</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState title="No requests received yet." />
        )}
      </Card>
    );
  }

  const labels = GROUPS[direction];
  const waiting = result.requests.filter(isWaiting);
  const responded = result.requests.filter((r) => !isWaiting(r));
  return (
    <Card className={surfaceFlush}>
      {waiting.length > 0 && (
        <Group
          title={labels.waiting}
          counterpart={labels.counterpart}
          showWaiting
          requests={waiting}
        />
      )}
      {responded.length > 0 && (
        <Group
          title={labels.responded}
          counterpart={labels.counterpart}
          requests={responded}
        />
      )}
    </Card>
  );
}

// A heading row with the column labels, then the group's rows.
function Group({
  title,
  counterpart,
  showWaiting = false,
  requests,
}: {
  title: string;
  counterpart: string;
  showWaiting?: boolean;
  requests: RequestListItem[];
}) {
  const headingId = useId();
  const label = "text-xs font-medium text-muted-foreground";
  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-hairline first:border-t-0"
    >
      <div className={cn(GRID, "px-5 pt-5 pb-2.5")}>
        <h2 id={headingId} className="text-sm leading-5 font-semibold">
          {title}
        </h2>
        <span aria-hidden className={cn(label, "hidden sm:block")}>
          {counterpart}
        </span>
        <span
          aria-hidden
          className={cn(label, "hidden text-right sm:block")}
        >
          {showWaiting ? "Waiting" : ""}
        </span>
        <span aria-hidden className={cn(label, "hidden sm:block")}>
          Status
        </span>
        <span aria-hidden className="hidden sm:block" />
      </div>
      <ul className="divide-y divide-hairline border-t border-hairline">
        {requests.map((r) => (
          <li key={r.id}>
            <RequestRow
              request={r}
              counterpart={counterpart}
              showWaiting={showWaiting}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Title with the reference beneath it, the other entity, how long it has
// waited (pending rows only) and the status. On phones the entity and the
// waiting time move under the reference.
function RequestRow({
  request: r,
  counterpart,
  showWaiting,
}: {
  request: RequestListItem;
  counterpart: string;
  showWaiting: boolean;
}) {
  return (
    <Link
      href={`/requests/${r.id}`}
      className={cn(
        GRID,
        "px-5 py-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium" title={r.title}>
          {r.title}
        </span>
        <Reference value={r.reference} />
        <span className="text-[13px] text-muted-foreground sm:hidden">
          {counterpart} {r.counterpartEntity.name}
          {showWaiting && (
            <>
              {" · "}
              <WaitingTime since={r.createdAt} className="text-[13px]" />
            </>
          )}
        </span>
      </div>
      <span className="hidden text-sm text-balance text-muted-foreground sm:block">
        <span className="sr-only">{counterpart} </span>
        {r.counterpartEntity.name}
      </span>
      <span className="hidden text-right sm:block">
        {showWaiting && (
          <>
            <span className="sr-only">Waiting </span>
            <WaitingTime since={r.createdAt} />
          </>
        )}
      </span>
      <StatusBadge
        variant={partyVariant(r.status, r.flagged)}
        className="justify-self-start"
      />
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </Link>
  );
}
