import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR } from "@/lib/api";
import { EmptyState } from "./empty-state";

// Shown inside a surface in place of content that failed to load. The message
// is the heading, with Try again beneath it.
export function ErrorState({
  message = FALLBACK_ERROR,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      role="alert"
      title={message}
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
