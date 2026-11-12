import { cn } from "@/lib/utils";

// One section of a dossier surface (Card className={surfaceFlush}): a
// heading with optional meta on the right (e.g. "2 reasons"), then its
// content. Sections are divided by hairlines, never by cards inside cards.
export function DossierSection({
  title,
  meta,
  children,
  className,
}: {
  title?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 border-t border-hairline px-6 py-5 first:border-t-0",
        className,
      )}
    >
      {title && (
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm leading-5 font-semibold">{title}</h2>
          {meta && (
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {meta}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
