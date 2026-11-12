import { cn } from "@/lib/utils";

// Text-led and left-aligned inside a surface: a short heading, an optional
// sentence and an optional action. No icon tile (AGENTS.md -> Inner screens).
export function EmptyState({
  title,
  description,
  action,
  className,
  ...props
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
} & Omit<React.ComponentProps<"div">, "children" | "title">) {
  return (
    <div
      className={cn("flex flex-col items-start gap-1.5 px-6 py-10", className)}
      {...props}
    >
      <p className="text-[15px] leading-6 font-semibold">{title}</p>
      {description && (
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
