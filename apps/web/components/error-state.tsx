import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR } from "@/lib/api";

// Shown in place of a page's content when loading it failed.
export function ErrorState({
  message = FALLBACK_ERROR,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-lg border px-6 py-12 text-center"
    >
      <p className="text-sm">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
