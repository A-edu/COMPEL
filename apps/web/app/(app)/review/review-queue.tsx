"use client";

import {
  ArrowUpDown,
  ChevronRight,
  FileQuestion,
  Flag,
  Hourglass,
  Inbox,
  Scale,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";
import { Reference } from "@/components/app/reference";
import { ListSkeleton } from "@/components/app/skeletons";
import { StatusBadge, type RequestStatus } from "@/components/app/status-badge";
import { surfaceFlush } from "@/components/app/surface";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";

type View = "queue" | "flagged" | "pending" | "decided";
type Sort = "oldest" | "newest";

interface QueueItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  requestingEntity: { id: string; name: string };
  providingEntity: { id: string; name: string };
}

type Result =
  | { requests: QueueItem[] }
  | { error: string }
  | { notFound: true };

const VIEWS: {
  value: View;
  label: string;
  empty: string;
  icon: LucideIcon;
}[] = [
  {
    value: "queue",
    label: "In queue",
    empty: "No requests to review.",
    icon: Inbox,
  },
  {
    value: "flagged",
    label: "Flagged",
    empty: "No flagged requests.",
    icon: Flag,
  },
  {
    value: "pending",
    label: "Awaiting response",
    empty: "No requests awaiting a response.",
    icon: Hourglass,
  },
  {
    value: "decided",
    label: "Decided",
    empty: "No decided requests yet.",
    icon: Scale,
  },
];

const TRIGGER =
  "rounded-md px-3 data-[state=active]:bg-white data-[state=active]:shadow-xs";

function viewFrom(value: string | null): View {
  return VIEWS.find((v) => v.value === value)?.value ?? "queue";
}

// The defaults stay out of the URL, so a plain /review is the queue.
function pathFor(view: View, sort: Sort) {
  const params = new URLSearchParams();
  if (view !== "queue") params.set("view", view);
  if (sort !== "oldest") params.set("sort", sort);
  const query = params.toString();
  return query ? `/review?${query}` : "/review";
}

// The view and sort live in the URL (?view=flagged&sort=newest).
export function ReviewQueue() {
  const searchParams = useSearchParams();
  const view = viewFrom(searchParams.get("view"));
  const sort: Sort = searchParams.get("sort") === "newest" ? "newest" : "oldest";
  const key = `${view}:${sort}`;
  // The last result per view and sort, so going back shows it at once while
  // it reloads. Kept in state, not a module, so it ends with the page (and
  // never outlives a logout). Missing while loading.
  const [results, setResults] = useState<Record<string, Result | undefined>>(
    {},
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (result: Result) =>
      setResults((prev) => ({ ...prev, [key]: result }));
    api<QueueItem[]>(`/review/requests?view=${view}&sort=${sort}`, {
      signal: controller.signal,
    })
      .then((requests) => settle({ requests }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // The API answers 404 to anyone who is not an officer.
        if (error instanceof ApiError && error.status === 404) {
          settle({ notFound: true });
        } else {
          settle({
            error: error instanceof ApiError ? error.message : FALLBACK_ERROR,
          });
        }
      });
    return () => controller.abort();
  }, [key, view, sort, attempt]);

  function retry() {
    setResults((prev) => ({ ...prev, [key]: undefined }));
    setAttempt((n) => n + 1);
  }

  // The native History API keeps useSearchParams in sync without a server
  // round trip.
  function go(nextView: View, nextSort: Sort) {
    window.history.replaceState(null, "", pathFor(nextView, nextSort));
  }

  const result = results[key];
  if (result && "notFound" in result) {
    return (
      <Card className={surfaceFlush}>
        <EmptyState icon={FileQuestion} message="Not found." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Review queue" />
      <Tabs
        value={view}
        onValueChange={(value) => go(viewFrom(value), sort)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-9 max-w-full justify-start overflow-x-auto rounded-lg bg-neutral-100 p-1">
            {VIEWS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className={TRIGGER}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(view, sort === "oldest" ? "newest" : "oldest")}
          >
            <ArrowUpDown data-icon="inline-start" aria-hidden />
            {sort === "oldest" ? "Oldest first" : "Newest first"}
          </Button>
        </div>
        <TabsContent value={view}>
          <QueueCard view={view} result={result} onRetry={retry} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Shown until the URL can be read on the client.
export function ReviewQueueSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Review queue" />
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <Card className={surfaceFlush}>
        <ListSkeleton />
      </Card>
    </div>
  );
}

function QueueCard({
  view,
  result,
  onRetry,
}: {
  view: View;
  result: Exclude<Result, { notFound: true }> | undefined;
  onRetry: () => void;
}) {
  const { empty, icon } = VIEWS.find((v) => v.value === view) ?? VIEWS[0];
  return (
    <Card className={surfaceFlush}>
      {result === undefined ? (
        <ListSkeleton />
      ) : "error" in result ? (
        <ErrorState message={result.error} onRetry={onRetry} />
      ) : result.requests.length === 0 ? (
        <EmptyState icon={icon} message={empty} />
      ) : (
        <ul className="divide-y divide-black/6">
          {result.requests.map((r) => (
            <li key={r.id}>
              <QueueRow request={r} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Title, reference and the two entities, then the status as an officer sees
// it (Sprint 2 spec §3.1).
function QueueRow({ request: r }: { request: QueueItem }) {
  return (
    <Link
      href={`/review/${r.id}`}
      className="flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[15px] font-medium" title={r.title}>
          {r.title}
        </span>
        <Reference value={r.reference} />
        <span className="text-sm text-muted-foreground">
          {r.requestingEntity.name} to {r.providingEntity.name}
        </span>
      </div>
      <StatusBadge
        status={r.status}
        flagged={r.flagged}
        flaggedLabel="Flagged"
        className="shrink-0"
      />
      <ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden />
    </Link>
  );
}
