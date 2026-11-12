import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholders shaped like the content they replace.

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 py-0.5">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

// One list row: title, reference, other entity, status badge.
export function ListRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-6 px-5 py-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-[22px] w-28 rounded-md" />
    </div>
  );
}

// Rows for a list card (Card className={surfaceFlush}).
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-hairline">
      {Array.from({ length: rows }, (_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}

// A detail panel (Card className={surface}): a heading line and a few rows.
export function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4 px-6">
      <Skeleton className="h-4 w-40" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

// A case (CaseHeader, then CaseLayout with a dossier and a side panel).
export function CaseSkeleton({ aside = true }: { aside?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-[22px] w-28 rounded-md" />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6 rounded-xl bg-card px-6 py-5 ring-1 ring-hairline">
          <div className="grid gap-5 sm:grid-cols-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        {aside && (
          <div className="flex flex-col gap-4 rounded-xl bg-card px-6 py-5 ring-1 ring-hairline">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
