import { cn } from "@/lib/utils";

// The small abbreviation tag for an entity (e.g. GOSI): its slug in upper
// case, with the full name in `title`. Used in tables and dossiers, never in
// the header.
export function EntityTag({
  entity,
  className,
}: {
  entity: { name: string; slug: string };
  className?: string;
}) {
  return (
    <span
      title={entity.name}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[5px] bg-sunken px-1.5 text-[11px] leading-none font-medium tracking-[0.02em] text-ink-2 ring-1 ring-hairline ring-inset",
        className,
      )}
    >
      {entity.slug.toUpperCase()}
    </span>
  );
}
