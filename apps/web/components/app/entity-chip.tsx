import { Skeleton } from "@/components/ui/skeleton";

const CHIP =
  "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-3";

// The header's pill: the entity name only, no initials (docs/design/sprint-2.md
// -> Officer header). `title` defaults to the name; officers get their email.
export function EntityChip({
  name,
  suffix,
  title,
}: {
  name: string;
  // Muted text after the name, e.g. "SDAIA" after "Compliance officer".
  suffix?: string;
  title?: string;
}) {
  return (
    <div className={CHIP} title={title ?? name}>
      <span className="max-w-60 truncate text-sm font-medium">
        {name}
      </span>
      {suffix && (
        <>
          <span aria-hidden className="text-sm text-muted-foreground">
            ·
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">
            {suffix}
          </span>
        </>
      )}
    </div>
  );
}

export function EntityChipSkeleton() {
  return (
    <div className={CHIP} aria-hidden>
      <Skeleton className="h-3.5 w-36" />
    </div>
  );
}
