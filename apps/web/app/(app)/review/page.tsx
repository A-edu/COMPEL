"use client";

import { FileQuestion, Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";
import { Reference } from "@/components/app/reference";
import { ListSkeleton } from "@/components/app/skeletons";
import { surfaceFlush } from "@/components/app/surface";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";

interface QueueItem {
  id: string;
  reference: string;
  title: string;
}

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message?: string }
  | { kind: "ready"; requests: QueueItem[] };

export default function ReviewPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<QueueItem[]>("/review/requests", { signal: controller.signal }).then(
      (requests) => setState({ kind: "ready", requests }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // The API answers 404 to anyone who is not an officer.
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: "not-found" });
        } else {
          setState({
            kind: "error",
            message: error instanceof ApiError ? error.message : undefined,
          });
        }
      },
    );
    return () => controller.abort();
  }, [attempt]);

  if (state.kind === "not-found") {
    return (
      <Card className={surfaceFlush}>
        <EmptyState icon={FileQuestion} message="Not found." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Review queue" />
      <Card className={surfaceFlush}>
        {state.kind === "loading" ? (
          <ListSkeleton />
        ) : state.kind === "error" ? (
          <ErrorState message={state.message} onRetry={retry} />
        ) : state.requests.length === 0 ? (
          <EmptyState icon={Inbox} message="No requests to review." />
        ) : (
          <ul className="divide-y divide-black/6">
            {state.requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-5 py-4">
                <span className="truncate text-[15px] font-medium" title={r.title}>
                  {r.title}
                </span>
                <Reference value={r.reference} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
