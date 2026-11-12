import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Reference } from "./reference";
import { StatusBadge, type StatusVariant } from "./status-badge";

// The top of a case: a back link, the title (28/34), then the reference, the
// status and an optional meta line (docs/design/sprint-2.md -> Case view).
export function CaseHeader({
  back,
  title,
  reference,
  status,
  meta,
}: {
  back: { href: string; label: string };
  title: string;
  reference: string;
  status: StatusVariant;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={back.href}
        className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {back.label}
      </Link>
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-balance">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Reference value={reference} />
        <StatusBadge variant={status} />
        {meta && (
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {meta}
          </span>
        )}
      </div>
    </div>
  );
}
