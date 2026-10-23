"use client";

import { FileQuestion } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { surfaceFlush } from "@/components/app/surface";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { RequestDetailSkeleton } from "./detail-skeleton";
import { RequestDetailView } from "./request-detail";
import type { RequestDetail } from "./types";

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message?: string }
  | { kind: "ready"; request: RequestDetail };

export default function RequestPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  // Fetches again while the current view stays on screen, e.g. to swap the
  // response form for the read-only response once it is submitted.
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    api<RequestDetail>(`/requests/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    }).then(
      (request) => setState({ kind: "ready", request }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // The API answers 404 for a request the user's entity is not a
        // party to, so this also covers other entities' requests.
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
  }, [id, attempt]);

  switch (state.kind) {
    case "loading":
      return <RequestDetailSkeleton />;
    case "not-found":
      return (
        <Card className={surfaceFlush}>
          <EmptyState icon={FileQuestion} message="Not found." />
        </Card>
      );
    case "error":
      return (
        <Card className={surfaceFlush}>
          <ErrorState message={state.message} onRetry={retry} />
        </Card>
      );
    case "ready":
      return (
        <RequestDetailView request={state.request} onResponded={reload} />
      );
  }
}
