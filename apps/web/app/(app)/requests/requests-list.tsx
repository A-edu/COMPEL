"use client";

import { ChevronRight, Inbox, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Reference } from "@/components/app/reference";
import { ListSkeleton } from "@/components/app/skeletons";
import { StatusBadge, type RequestStatus } from "@/components/app/status-badge";
import { surfaceFlush } from "@/components/app/surface";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";

type Tab = "sent" | "received";

interface RequestListItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  counterpartEntity: { id: string; name: string };
}

type Result = { requests: RequestListItem[] } | { error: string };

const TRIGGER =
  "rounded-md px-3 data-[state=active]:bg-white data-[state=active]:shadow-xs";

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
    const settle = (result: Result) =>
      setResults((prev) => ({ ...prev, [tab]: result }));
    api<RequestListItem[]>(`/requests?direction=${tab}`, {
      signal: controller.signal,
    })
      .then((requests) => settle({ requests }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        settle({
          error: error instanceof ApiError ? error.message : FALLBACK_ERROR,
        });
      });
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

  return (
    <Tabs value={tab} onValueChange={selectTab} className="gap-4">
      <TabsList className="h-9 rounded-lg bg-neutral-100 p-1">
        <TabsTrigger value="sent" className={TRIGGER}>
          Sent
        </TabsTrigger>
        <TabsTrigger value="received" className={TRIGGER}>
          Received
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
  return (
    <Card className={surfaceFlush}>
      {result === undefined ? (
        <ListSkeleton />
      ) : "error" in result ? (
        <ErrorState message={result.error} onRetry={onRetry} />
      ) : result.requests.length === 0 ? (
        direction === "sent" ? (
          <EmptyState
            icon={Send}
            message="No requests sent yet."
            action={
              <Button asChild>
                <Link href="/requests/new">New request</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState icon={Inbox} message="No requests received yet." />
        )
      ) : (
        <ul className="divide-y divide-black/6">
          {result.requests.map((r) => (
            <li key={r.id}>
              <RequestRow request={r} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Title with the reference beneath it, the other entity and the status
// (§8). On phones the entity moves under the reference.
function RequestRow({ request: r }: { request: RequestListItem }) {
  return (
    <Link
      href={`/requests/${r.id}`}
      className="flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[15px] font-medium" title={r.title}>
          {r.title}
        </span>
        <Reference value={r.reference} />
        <span className="text-sm text-muted-foreground sm:hidden">
          {r.counterpartEntity.name}
        </span>
      </div>
      <span className="hidden max-w-56 text-right text-sm text-balance text-muted-foreground sm:block">
        {r.counterpartEntity.name}
      </span>
      <StatusBadge status={r.status} className="shrink-0" />
      <ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden />
    </Link>
  );
}
