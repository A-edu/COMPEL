"use client";

import { FileQuestion } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequestDetailSkeleton } from "@/app/(app)/requests/[id]/detail-skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { surfaceFlush } from "@/components/app/surface";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { CaseView } from "./case-view";
import type { ReviewCase } from "./types";

type State =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message?: string }
  | { kind: "ready"; request: ReviewCase };

export default function ReviewCasePage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<ReviewCase>(`/review/requests/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    }).then(
      (request) => setState({ kind: "ready", request }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // The API answers 404 to anyone who is not an officer, and to an
        // officer for a request closed to them.
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
      return <CaseView request={state.request} />;
  }
}
