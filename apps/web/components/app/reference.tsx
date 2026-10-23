import { cn } from "@/lib/utils";

// A request reference, e.g. CMP-2026-000001.
export function Reference({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums text-muted-foreground",
        className,
      )}
    >
      {value}
    </span>
  );
}
