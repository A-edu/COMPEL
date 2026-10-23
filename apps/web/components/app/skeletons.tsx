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
    <div role="status" aria-label="Loading" className="divide-y divide-black/6">
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
