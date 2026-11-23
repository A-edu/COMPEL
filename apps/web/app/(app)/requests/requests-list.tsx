"use client";

import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
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
import { formatShortDate } from "@/lib/format";
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
  // When the status this user sees last changed (the Updated date).
  statusChangedAt: string;
  flagged?: true;
  // Sent rows only (Sprint 3 spec §2.7).
  underReview?: true;
  counterpartEntity: { id: string; name: string };
}

type Result = { requests: RequestListItem[] } | { error: string };

interface GroupText {
  title: string;
  empty: string;
  emptyDescription: string;
}

// Each tab is two cards: what still waits on the provider, then everything
// it has responded to (docs/design/sprint-2.md -> DPO requests list).
const GROUPS: Record<
  Tab,
  { waiting: GroupText; responded: GroupText; counterpart: string }
> = {
  received: {
    waiting: {
      title: "Awaiting your response",
      empty: "Nothing is waiting for your response.",
      emptyDescription:
        "New requests from other entities appear here until you respond.",
    },
    responded: {
      title: "Responded",
      empty: "No responses yet.",
      emptyDescription: "Requests move here once the provider responds.",
    },
    counterpart: "From",
  },
  sent: {
    waiting: {
      title: "Waiting for a response",
      empty: "Nothing is waiting for a response.",
      emptyDescription:
        "Requests you send stay here until the provider responds.",
    },
    responded: {
      title: "Responded",
      empty: "No responses yet.",
      emptyDescription: "Requests move here once the provider responds.",
    },
    counterpart: "To",
  },
};

// Responded rows shown before "Show all".
const COLLAPSED_ROWS = 5;

const isWaiting = (r: RequestListItem) =>
  r.status === "AWAITING_PROVIDER_RESPONSE";

const time = (iso: string) => new Date(iso).getTime();

// Request · counterpart · date · status · chevron, shared by the header and
// the rows of both cards so their columns line up. Below md the entity and
// the date move under the reference, and the header shows only the title.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_5.5rem_11.25rem_1rem] md:gap-6";

// The active tab lives in the URL (?tab=received); anything else is Sent.
export function RequestsList() {
  const tab: Tab =
    useSearchParams().get("tab") === "received" ? "received" : "sent";
  // The last result per tab, so switching back shows it at once while it
  // reloads. Kept in state, not a module, so it ends with the page (and
  // never outlives a logout). Missing while loading.
  const [results, setResults] = useState<Partial<Record<Tab, Result>>>({});
  const [attempt, setAttempt] = useState(0);
  // Whether each tab's Responded card shows every row.
  const [expanded, setExpanded] = useState<Record<Tab, boolean>>({
    sent: false,
    received: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    // Received is loaded on the Sent tab too, for its count of requests
    // awaiting a response.
    const tabs: Tab[] =
      tab === "received" ? ["received"] : ["sent", "received"];
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
        <RequestsGroups
          direction={tab}
          result={results[tab]}
          onRetry={retry}
          expanded={expanded[tab]}
          onToggle={() =>
            setExpanded((prev) => ({ ...prev, [tab]: !prev[tab] }))
          }
        />
      </TabsContent>
    </Tabs>
  );
}

// Shown until the URL can be read on the client.
export function RequestsListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-44 rounded-lg" />
      <GroupsSkeleton />
    </div>
  );
}

// Two cards, each a header and a few rows.
function GroupsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      {[3, 2].map((rows, i) => (
        <Card key={i} className={surfaceFlush}>
          <div className="flex items-center gap-2 border-b border-hairline px-5 py-3.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <ListSkeleton rows={rows} />
        </Card>
      ))}
    </div>
  );
}

function RequestsGroups({
  direction,
  result,
  onRetry,
  expanded,
  onToggle,
}: {
  direction: Tab;
  result: Result | undefined;
  onRetry: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (result === undefined) return <GroupsSkeleton />;
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

  const groups = GROUPS[direction];
  // Longest wait first.
  const waiting = result.requests
    .filter(isWaiting)
    .sort((x, y) => time(x.createdAt) - time(y.createdAt));
  // Most recently updated first.
  const responded = result.requests
    .filter((r) => !isWaiting(r))
    .sort((x, y) => time(y.statusChangedAt) - time(x.statusChangedAt));
  return (
    <div className="flex flex-col gap-6">
      <GroupCard
        text={groups.waiting}
        counterpart={groups.counterpart}
        dateLabel="Waiting"
        requests={waiting}
      />
      <GroupCard
        text={groups.responded}
        counterpart={groups.counterpart}
        dateLabel="Updated"
        requests={responded}
        collapsible
        expanded={expanded}
        onToggle={onToggle}
      />
    </div>
  );
}

// One group: a header row inside the card (the title, its count and the
// column labels), then the rows, or an empty state.
function GroupCard({
  text,
  counterpart,
  dateLabel,
  requests,
  collapsible = false,
  expanded = false,
  onToggle,
}: {
  text: GroupText;
  counterpart: string;
  dateLabel: "Waiting" | "Updated";
  requests: RequestListItem[];
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const headingId = useId();
  const listId = useId();
  const label = "hidden text-xs font-medium text-muted-foreground md:block";
  const empty = requests.length === 0;
  const canCollapse = collapsible && requests.length > COLLAPSED_ROWS;
  const shown =
    canCollapse && !expanded ? requests.slice(0, COLLAPSED_ROWS) : requests;

  return (
    <section aria-labelledby={headingId}>
      <Card className={surfaceFlush}>
        <div className={cn(GRID, "border-b border-hairline px-5 py-3.5")}>
          <h2
            id={headingId}
            className="flex min-w-0 items-center gap-2 text-[15px] leading-[22px] font-semibold"
          >
            {text.title}
            <span className="sr-only">, </span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sunken px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
              {requests.length}
            </span>
          </h2>
          {!empty && (
            <>
              <span aria-hidden className={label}>
                {counterpart}
              </span>
              <span aria-hidden className={cn(label, "text-right")}>
                {dateLabel}
              </span>
              <span aria-hidden className={label}>
                Status
              </span>
              <span aria-hidden className="hidden md:block" />
            </>
          )}
        </div>
        {empty ? (
          <EmptyState
            title={text.empty}
            description={text.emptyDescription}
            className="px-5"
          />
        ) : (
          <>
            <ul id={listId} className="divide-y divide-hairline">
              {shown.map((r) => (
                <li key={r.id}>
                  <RequestRow
                    request={r}
                    counterpart={counterpart}
                    dateLabel={dateLabel}
                  />
                </li>
              ))}
            </ul>
            {canCollapse && (
              <Button
                type="button"
                variant="ghost"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={onToggle}
                className="h-auto w-full justify-start gap-1.5 rounded-none rounded-b-xl border-0 border-t border-hairline px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-inset active:not-aria-[haspopup]:translate-y-0"
              >
                {expanded ? (
                  <>
                    Show fewer
                    <ChevronUp aria-hidden />
                  </>
                ) : (
                  <>
                    Show all {requests.length}
                    <ChevronDown aria-hidden />
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

// How long a pending request has waited, or when the status last changed.
function RowDate({
  request: r,
  dateLabel,
  className,
}: {
  request: RequestListItem;
  dateLabel: "Waiting" | "Updated";
  className?: string;
}) {
  return (
    <>
      <span className="sr-only">{dateLabel} </span>
      {dateLabel === "Waiting" ? (
        <WaitingTime since={r.createdAt} className={className} />
      ) : (
        <time
          dateTime={r.statusChangedAt}
          className={cn("text-sm tabular-nums", className)}
        >
          {formatShortDate(r.statusChangedAt)}
        </time>
      )}
    </>
  );
}

// Values only: the title with the reference beneath it, the other entity,
// the date and the status. Below md the entity and the date move under the
// reference.
function RequestRow({
  request: r,
  counterpart,
  dateLabel,
}: {
  request: RequestListItem;
  counterpart: string;
  dateLabel: "Waiting" | "Updated";
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
        <span className="text-[13px] text-muted-foreground md:hidden">
          <span className="sr-only">{counterpart} </span>
          {r.counterpartEntity.name}
          {" · "}
          <RowDate request={r} dateLabel={dateLabel} className="text-[13px]" />
        </span>
      </div>
      <span className="hidden text-sm text-balance text-muted-foreground md:block">
        <span className="sr-only">{counterpart} </span>
        {r.counterpartEntity.name}
      </span>
      <span className="hidden text-right md:block">
        <RowDate request={r} dateLabel={dateLabel} />
      </span>
      <StatusBadge
        variant={partyVariant(r.status, r.flagged ?? r.underReview)}
        className="justify-self-start"
      />
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </Link>
  );
}
