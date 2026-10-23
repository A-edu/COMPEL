import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR } from "@/lib/api";
import { EmptyState } from "./empty-state";

// Shown inside a card in place of content that failed to load.
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
      icon={CircleAlert}
      message={message}
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
