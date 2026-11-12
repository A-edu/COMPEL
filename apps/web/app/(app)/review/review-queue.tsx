"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { EntityTag } from "@/components/app/entity-tag";
import { ErrorState } from "@/components/app/error-state";
import { flagSourceLabel } from "@/components/app/flag-reason";
import { PageHeader } from "@/components/app/page-header";
import { Reference } from "@/components/app/reference";
import { segmentedList, segmentedTrigger } from "@/components/app/segmented";
import { ListSkeleton } from "@/components/app/skeletons";
import { StatusBadge, type RequestStatus } from "@/components/app/status-badge";
import { surfaceFlush } from "@/components/app/surface";
import { WaitingTime } from "@/components/app/waiting-time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError, FALLBACK_ERROR } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { officerVariant } from "@/lib/status";

type View = "flagged" | "pending" | "queue" | "decided";
type OpenView = Exclude<View, "decided">;
type Sort = "longest" | "recent";

interface QueueEntity {
  id: string;
  name: string;
  slug: string;
}

// GET /api/review/requests (Sprint 2 spec §7). Dates arrive as ISO strings.
interface QueueItem {
  id: string;
  reference: string;
  title: string;
  status: RequestStatus;
  flagged: boolean;
  requestingEntity: QueueEntity;
  providingEntity: QueueEntity;
  waitingSince?: string;
  flagSources?: string[];
  outcome?: "APPROVED" | "REJECTED";
  decidedAt?: string;
}

interface Queue {
  items: QueueItem[];
  counts: Record<OpenView, number>;
  entities: QueueEntity[];
}

type Result = { queue: Queue } | { error: string } | { notFound: true };

// Filter order and names from docs/design/sprint-2.md -> Review queue.
const VIEWS: { value: View; label: string }[] = [
  { value: "flagged", label: "Flagged" },
  { value: "pending", label: "Awaiting response" },
  { value: "queue", label: "All open" },
  { value: "decided", label: "Decided" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "longest", label: "Longest waiting" },
  { value: "recent", label: "Most recent" },
];

// Radix Select needs a non-empty value for "any".
const ANY_ENTITY = "any";

interface Filters {
  view: View;
  entity: string | null;
  sort: Sort;
}

function viewFrom(value: string | null): View {
  return VIEWS.find((v) => v.value === value)?.value ?? "queue";
}

// The defaults stay out of the URL, so a plain /review is All open, any
// entity, longest waiting first.
function pathFor({ view, entity, sort }: Filters) {
  const params = new URLSearchParams();
  if (view !== "queue") params.set("view", view);
  if (entity) params.set("entity", entity);
  if (sort !== "longest") params.set("sort", sort);
  const query = params.toString();
  return query ? `/review?${query}` : "/review";
}

function apiPathFor({ view, entity, sort }: Filters) {
  const params = new URLSearchParams({ view, sort });
  if (entity) params.set("entity", entity);
  return `/review/requests?${params.toString()}`;
}

// The filter, entity and sort live in the URL
// (?view=flagged&entity=…&sort=recent).
export function ReviewQueue() {
  const searchParams = useSearchParams();
  const filters: Filters = {
    view: viewFrom(searchParams.get("view")),
    entity: searchParams.get("entity") || null,
    sort: searchParams.get("sort") === "recent" ? "recent" : "longest",
  };
  const key = apiPathFor(filters);
  // The last result per filter combination, so going back shows it at once
  // while it reloads. Kept in state, not a module, so it ends with the page
  // (and never outlives a logout). Missing while loading.
  const [results, setResults] = useState<Record<string, Result | undefined>>(
    {},
  );
  // The latest counts and entity list, kept while another filter loads.
  const [latest, setLatest] = useState<Omit<Queue, "items">>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (result: Result) =>
      setResults((prev) => ({ ...prev, [key]: result }));
    api<Queue>(key, { signal: controller.signal })
      .then((queue) => {
        settle({ queue });
        setLatest({ counts: queue.counts, entities: queue.entities });
      })
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
  }, [key, attempt]);

  function retry() {
    setResults((prev) => ({ ...prev, [key]: undefined }));
    setAttempt((n) => n + 1);
  }

  // The native History API keeps useSearchParams in sync without a server
  // round trip.
  function go(next: Partial<Filters>) {
    window.history.replaceState(null, "", pathFor({ ...filters, ...next }));
  }

  const result = results[key];
  if (result && "notFound" in result) {
    return (
      <Card className={surfaceFlush}>
        <EmptyState title="Not found." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <QueueHeader />
      <Card className={surfaceFlush}>
        <Toolbar
          filters={filters}
          counts={latest?.counts}
          entities={latest?.entities}
          onChange={go}
        />
        {result === undefined ? (
          <ListSkeleton />
        ) : "error" in result ? (
          <ErrorState message={result.error} onRetry={retry} />
        ) : result.queue.items.length > 0 ? (
          <QueueTable view={filters.view} items={result.queue.items} />
        ) : !filters.entity &&
          filters.view !== "decided" &&
          result.queue.counts.queue === 0 ? (
          <EmptyState
            title="Nothing is waiting for a decision."
            description="Flagged requests appear here as soon as a provider objects, and requests still awaiting a provider's response appear under Awaiting response."
            action={
              <Button variant="outline" onClick={() => go({ view: "decided" })}>
                See decided requests
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No requests match."
            description="Try another entity, or show all open requests."
          />
        )}
      </Card>
    </div>
  );
}

function QueueHeader() {
  return (
    <PageHeader
      title="Review queue"
      description="Requests from every entity that are waiting on a provider or on a decision."
    />
  );
}

// Shown until the URL can be read on the client.
export function ReviewQueueSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <QueueHeader />
      <Card className={surfaceFlush}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <Skeleton className="h-9 w-full max-w-md rounded-lg" />
          <Skeleton className="h-8 w-64 rounded-lg" />
        </div>
        <ListSkeleton />
      </Card>
    </div>
  );
}

function Toolbar({
  filters,
  counts,
  entities,
  onChange,
}: {
  filters: Filters;
  counts?: Record<OpenView, number>;
  entities?: QueueEntity[];
  onChange: (next: Partial<Filters>) => void;
}) {
  // An entity from the URL that isn't in the list still gets a label.
  const entityOptions =
    filters.entity && entities && !entities.some((e) => e.id === filters.entity)
      ? [...entities, { id: filters.entity, name: filters.entity, slug: "" }]
      : (entities ?? []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
      <Tabs
        value={filters.view}
        onValueChange={(value) => onChange({ view: viewFrom(value) })}
      >
        <TabsList
          aria-label="Filter"
          className={`${segmentedList} justify-start overflow-x-auto`}
        >
          {VIEWS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className={segmentedTrigger}>
              {label}
              {value !== "decided" && counts && (
                <span className="text-muted-foreground tabular-nums">
                  {counts[value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.entity ?? ANY_ENTITY}
          onValueChange={(value) =>
            onChange({ entity: value === ANY_ENTITY ? null : value })
          }
        >
          <SelectTrigger aria-label="Entity" className="max-w-56 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value={ANY_ENTITY}>Any entity</SelectItem>
            {entityOptions.map((entity) => (
              <SelectItem key={entity.id} value={entity.id}>
                {entity.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* The decided view always lists the newest decision first. */}
        {filters.view !== "decided" && (
          <Select
            value={filters.sort}
            onValueChange={(value) => onChange({ sort: value as Sort })}
          >
            <SelectTrigger aria-label="Sort" className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {SORTS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

const HEAD = "h-9 px-4 text-xs font-medium text-muted-foreground";
const CELL = "px-4 py-3.5";

function QueueTable({ view, items }: { view: View; items: QueueItem[] }) {
  const decided = view === "decided";
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-hairline hover:bg-transparent">
          <TableHead className={HEAD}>Request</TableHead>
          <TableHead className={HEAD}>Requester → provider</TableHead>
          <TableHead className={`${HEAD} hidden md:table-cell`}>
            {decided ? "Flagged by" : "Flag reason"}
          </TableHead>
          <TableHead className={`${HEAD} text-right`}>
            {decided ? "Decided" : "Waiting"}
          </TableHead>
          <TableHead className={`${HEAD} hidden sm:table-cell`}>Status</TableHead>
          <TableHead className="w-10 px-2">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <QueueRow key={item.id} item={item} />
        ))}
      </TableBody>
    </Table>
  );
}

// One request. The whole row links to the case through the title's link,
// stretched over the row, so it stays one tab stop.
function QueueRow({ item }: { item: QueueItem }) {
  const sources = item.flagSources ?? [];
  return (
    <TableRow className="relative border-hairline last:border-0 hover:bg-muted/60">
      <TableCell className={`${CELL} max-w-72 whitespace-normal`}>
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/review/${item.id}`}
            title={item.title}
            className="truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
          >
            {item.title}
          </Link>
          <Reference value={item.reference} />
        </div>
      </TableCell>
      <TableCell className={CELL}>
        <span className="flex items-center gap-1.5">
          <EntityTag entity={item.requestingEntity} />
          <ArrowRight
            className="size-3.5 text-muted-foreground"
            aria-label="to"
          />
          <EntityTag entity={item.providingEntity} />
        </span>
      </TableCell>
      <TableCell className={`${CELL} hidden text-sm md:table-cell`}>
        {sources.length > 0 ? (
          sources.map(flagSourceLabel).join(", ")
        ) : item.flagged || item.decidedAt ? null : (
          <span className="text-muted-foreground">No response yet</span>
        )}
      </TableCell>
      <TableCell className={`${CELL} text-right`}>
        {item.decidedAt ? (
          <time
            dateTime={item.decidedAt}
            className="text-sm tabular-nums"
          >
            {formatDate(item.decidedAt)}
          </time>
        ) : item.waitingSince ? (
          <div className="flex flex-col items-end gap-0.5">
            <WaitingTime since={item.waitingSince} />
            <span className="text-[13px] text-muted-foreground">
              {item.flagged ? "on a decision" : "on the provider"}
            </span>
          </div>
        ) : null}
      </TableCell>
      <TableCell className={`${CELL} hidden sm:table-cell`}>
        <StatusBadge variant={officerVariant(item.status, item.flagged)} />
      </TableCell>
      <TableCell className="w-10 px-2">
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </TableCell>
    </TableRow>
  );
}
