import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Centred icon, message and optional action. Sits inside a card.
export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
  ...props
}: {
  icon: LucideIcon;
  message: React.ReactNode;
  action?: React.ReactNode;
} & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 px-6 py-16 text-center",
        className,
      )}
      {...props}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 ring-1 ring-black/5 ring-inset">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="max-w-sm text-sm text-neutral-600">{message}</p>
      {action}
    </div>
  );
}
